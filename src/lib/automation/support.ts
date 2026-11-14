import "server-only";
import { z } from "zod";
import { abortable, createDeadline } from "../ai/deadline";
import { AiError } from "../ai/errors";
import { normalizeAiOutcome } from "../ai/outcome";
import { PlaybookOrderError, startPlaybook, type PlaybookStepRecord } from "../ai/playbook";
import { capabilitiesFor, playbookPrompt } from "../ai/plugin";
import type { AiProviderTrace, AiTextProvider } from "../ai/providers/types";
import type { NotificationResult } from "./notification";

const uuid = z.uuid();
const evidenceId = z.string().min(1).max(120);
const contextSchema = z.strictObject({
  eventId: uuid,
  question: z.string().max(2000).refine(question => Boolean(question.trim())),
  evidence: z.array(z.strictObject({
    id: evidenceId,
    kind: z.enum(["help", "status"]),
    body: z.string().max(5000).refine(body => Boolean(body.trim())),
  })).max(12),
  revision: z.string().regex(/^[a-f0-9]{64}$/iu),
}).refine(({ evidence }) => new Set(evidence.map(item => item.id)).size === evidence.length &&
  evidence.reduce((total, item) => total + Array.from(item.body).length, 0) <= 8000);

const outputSchema = z.strictObject({
  answer: z.string().max(2000),
  citations: z.array(evidenceId).max(12),
  category: z.enum(["usage", "status", "escalate"]),
});

const supportJsonSchema = {
  name: "yeobek_ops_support_reply",
  definition: {
    type: "object",
    additionalProperties: false,
    required: ["answer", "citations", "category"],
    properties: {
      answer: { type: "string" },
      citations: { type: "array", items: { type: "string" } },
      category: { type: "string", enum: ["usage", "status", "escalate"] },
    },
  },
};

type SupportOutbound = { channel: "support"; category: "usage" | "status"; body: string };
export type SupportReplyResult = Omit<NotificationResult, "outbound"> & { outbound: SupportOutbound | null };

const sensitiveQuestion = /결제|지불|청구|환불|권리|저작권|라이선스|라이센스|이용\s*허락|사용\s*허가|삭제|파기|탈퇴|\b(?:pay(?:s|ment|ments|ing)?|paid|billing|refund\w*|rights?|copyright\w*|licen[cs]\w*|delet\w*|eras\w*)\b/iu;
const unsafeAnswer = /[<>@\p{Cc}\p{Cf}\p{Zl}\p{Zp}]|(?:\b(?:https?|file|data|mailto|ftp)\s*:|\bwww\.|(?:[\p{L}\p{N}-]+\.)+[\p{L}-]{2,})/iu;
const uuidInText = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;

const normalize = (text: string) => text.normalize("NFKC").toLowerCase();

export async function runSupportReply(eventId: string, deps: {
  text: AiTextProvider;
  readContext: () => Promise<unknown | null>;
}, signal?: AbortSignal): Promise<SupportReplyResult> {
  const started = performance.now();
  const deadline = createDeadline(30_000, signal);
  const flow = startPlaybook("ops-support-reply");
  const capabilities = capabilitiesFor("ops-support-reply", { support: { read: deps.readContext } });
  const usage: AiProviderTrace[] = [];
  const read = () => abortable(deadline.signal, () => capabilities["support.read"]());
  const result = (state: SupportReplyResult["state"], resultCode: string, steps: readonly PlaybookStepRecord[],
    outbound: SupportOutbound | null = null): SupportReplyResult =>
    ({ state, resultCode, outbound, usage, steps, elapsedMs: Math.round(performance.now() - started) });

  try {
    const context = await flow.step("support.read", async () => {
      deadline.signal.throwIfAborted();
      if (!uuid.safeParse(eventId).success) throw new AiError("invalid_input");
      const raw = await read();
      if (raw === null) return null;
      const parsed = contextSchema.safeParse(raw);
      if (!parsed.success || parsed.data.eventId !== eventId) throw new AiError("invalid_response");
      return parsed.data;
    });
    if (context === null) {
      for (const step of ["evidence.select", "model.generate", "output.validate", "support.recheck"] as const) {
        flow.skip(step, "stale_context");
      }
      return result("suppressed", "STALE_CONTEXT", flow.finish());
    }

    const escalation = await flow.step("evidence.select", () => {
      deadline.signal.throwIfAborted();
      if (sensitiveQuestion.test(normalize(context.question).replace(/\p{Cf}/gu, ""))) return "sensitive_question";
      return context.evidence.length ? null : "no_evidence";
    });
    if (escalation) {
      for (const step of ["model.generate", "output.validate", "support.recheck"] as const) flow.skip(step, escalation);
      return result("escalated", escalation.toUpperCase(), flow.finish());
    }

    const output = await flow.step("model.generate", async () => {
      const generated = await abortable(deadline.signal, active => deps.text.generate({
        system: playbookPrompt("ops-support-reply"),
        schema: supportJsonSchema,
        input: JSON.stringify({ question: context.question, evidence: context.evidence }),
        maxOutputTokens: 1800,
        signal: active,
      }));
      usage.push(generated.trace);
      return generated.output;
    });

    const outbound = await flow.step("output.validate", (): SupportOutbound | null => {
      deadline.signal.throwIfAborted();
      const parsed = outputSchema.safeParse(output);
      if (!parsed.success) throw new AiError("invalid_response");
      const { answer, citations, category } = parsed.data;
      if (category === "escalate") {
        if (answer !== "" || citations.length) throw new AiError("invalid_response");
        return null;
      }
      const normalized = normalize(answer);
      const kindsById = new Map(context.evidence.map(item => [item.id, item.kind]));
      const requiredKind = category === "usage" ? "help" : "status";
      if (!/\p{Script=Hangul}/u.test(answer) || unsafeAnswer.test(answer) || unsafeAnswer.test(normalized) ||
          uuidInText.test(normalized) || context.evidence.some(item => normalized.includes(normalize(item.id))) ||
          new Set(citations).size !== citations.length || citations.some(id => !kindsById.has(id)) ||
          !citations.some(id => kindsById.get(id) === requiredKind)) {
        throw new AiError("invalid_response");
      }
      return { channel: "support", category, body: answer.trim() };
    });

    const current = await flow.step("support.recheck", async () => {
      const latest = contextSchema.safeParse(await read());
      return latest.success && JSON.stringify(latest.data) === JSON.stringify(context);
    });
    const steps = flow.finish();
    if (signal?.aborted) return result("failed", "REQUEST_CANCELLED", steps);
    if (deadline.timedOut()) return result("failed", "REQUEST_TIMEOUT", steps);
    if (!current) return result("suppressed", "STALE_CONTEXT", steps);
    if (outbound === null) return result("escalated", "MODEL_ESCALATED", steps);
    return result("processed", "SUPPORT_REPLY_READY", steps, outbound);
  } catch (error) {
    if (error instanceof PlaybookOrderError) throw error;
    const reason = signal?.aborted ? new AiError("cancelled") : deadline.timedOut() ? new AiError("timeout") : error;
    return result("failed", normalizeAiOutcome(reason).code, flow.fail(error));
  } finally {
    deadline.dispose();
  }
}
