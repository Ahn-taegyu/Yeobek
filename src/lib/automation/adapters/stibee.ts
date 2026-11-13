import "server-only";
import { z } from "zod";
import { abortable, createDeadline } from "../../ai/deadline";
import { AutomationError } from "../errors";
import type { MailPort, DispatchResult } from "../ports";

const mailInput = z.object({
  recipient: z.email().max(254),
  template: z.enum(["transactional", "marketing"]),
  paragraph: z.string().trim().min(1).max(2000).refine(value => !value.includes("\0")),
}).strict();

function templateUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.origin === "https://stibee.com" && !url.username && !url.password &&
        !url.search && !url.hash && /^\/api\/v1\.0\/auto\/[A-Za-z0-9_-]+$/.test(url.pathname)) return url.href;
  } catch { /* do not expose configuration */ }
  throw new AutomationError("not_configured");
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

/** https://help.stibee.com/email/automation/api
 * 200 means trigger accepted, not email delivered. No automatic resend, including 5xx. */
export function createStibeeAdapter(config: {
  apiKey: string;
  templates: { transactional: string; marketing: string };
  paragraphField: string;
}, options: { fetch?: typeof fetch; timeoutMs?: number } = {}): MailPort {
  if (!config.apiKey || /[\r\n]/.test(config.apiKey) ||
      !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(config.paragraphField) ||
      ["subscriber", "constructor", "prototype", "__proto__"].includes(config.paragraphField)) {
    throw new AutomationError("not_configured");
  }
  const urls = { transactional: templateUrl(config.templates.transactional), marketing: templateUrl(config.templates.marketing) };
  if (urls.transactional === urls.marketing) throw new AutomationError("not_configured");
  const timeoutMs = options.timeoutMs ?? 15000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) throw new AutomationError("invalid_input");
  return {
    async send(input, signal) {
      const parsed = mailInput.safeParse(input);
      if (!parsed.success) throw new AutomationError("invalid_input");
      if (signal?.aborted) throw new AutomationError("cancelled");
      const { recipient, template, paragraph } = parsed.data;
      const body = JSON.stringify({ subscriber: recipient, [config.paragraphField]: escapeHtml(paragraph) });
      const deadline = createDeadline(timeoutMs, signal);
      try {
        return await abortable(deadline.signal, async active => {
          const response = await (options.fetch ?? fetch)(urls[template], {
            method: "POST", headers: { AccessToken: config.apiKey, "Content-Type": "application/json" },
            body, signal: active, redirect: "error", cache: "no-store",
          });
          // The body is not a documented delivery receipt and may contain private details.
          void response.body?.cancel().catch(() => {});
          if (response.status === 200) return { status: "accepted", code: "accepted", mock: false } satisfies DispatchResult;
          if (response.status === 429) return { status: "rejected", code: "rate_limited", mock: false } satisfies DispatchResult;
          if ([400, 401, 403, 404, 405, 413, 415, 422].includes(response.status)) return { status: "rejected", code: "provider_rejected", mock: false } satisfies DispatchResult;
          return { status: "unknown", code: "ambiguous_transport", mock: false } satisfies DispatchResult;
        });
      } catch {
        // A timeout, cancellation or network error after dispatch may still have sent mail.
        return { status: "unknown", code: "ambiguous_transport", mock: false };
      } finally {
        deadline.dispose();
      }
    },
  };
}
