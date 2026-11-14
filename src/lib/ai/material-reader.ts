import "server-only";
import { z } from "zod";
import { AiError } from "./errors";
import { abortable, createDeadline } from "./deadline";
import type { AiProviderTrace, AiTextProvider, AiTextRequest } from "./providers/types";
import { playbookPrompt } from "./plugin";
import { startPlaybook } from "./playbook";
import { validateMedia } from "./providers/media";

export const MATERIAL_TEXT_LIMIT = 200_000;
const page = z.strictObject({ page: z.number().int().min(1).max(20), text: z.string().max(100_000).refine(s => !s.includes("\0")) });
const resultSchema = z.strictObject({ pages: z.array(page).min(1).max(20) });
export type MaterialPage = z.infer<typeof page>;
export type MaterialChunk = { pageStart: number; pageEnd: number; text: string };

export function materialChunks(pages: MaterialPage[], pageCount: number): MaterialChunk[] {
  const result = resultSchema.safeParse({ pages });
  if (!result.success || pages.length !== pageCount || pages.some((p, index) => p.page !== index + 1) ||
      pages.reduce((n, p) => n + Array.from(p.text).length, 0) > MATERIAL_TEXT_LIMIT) throw new AiError("invalid_response");
  return pages.flatMap(p => {
    const text = Array.from(p.text.trim());
    const chunks: MaterialChunk[] = [];
    for (let start = 0; start < text.length; start += 5000) {
      const body = text.slice(start, start + 5000).join("").trim();
      if (body) chunks.push({ pageStart: p.page, pageEnd: p.page, text: body });
    }
    return chunks;
  });
}

/** Text extraction only; this never interprets a picture as an artwork fact. */
export async function readTextPdf(bytes: Uint8Array, maxPages: number, signal?: AbortSignal) {
  validateMedia({ contentType: "application/pdf", data: bytes });
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 20) throw new AiError("invalid_input");
  const deadline = createDeadline(15_000, signal);
  let loading: ReturnType<typeof import("pdfjs-dist/legacy/build/pdf.mjs").getDocument> | undefined;
  try {
    return await abortable(deadline.signal, async active => {
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
      active.throwIfAborted();
      loading = getDocument({ data: new Uint8Array(bytes), verbosity: 0,
        useSystemFonts: false, disableFontFace: true, useWorkerFetch: false, stopAtErrors: true });
      const pdf = await loading.promise;
      if (pdf.numPages > Math.min(maxPages, 20)) throw new AiError("invalid_input");
      const pages: MaterialPage[] = [];
      let needsVision = false;
      let chars = 0;
      for (let number = 1; number <= pdf.numPages; number++) {
        active.throwIfAborted();
        const pdfPage = await pdf.getPage(number);
        try {
          const { items } = await pdfPage.getTextContent();
          const text = items.flatMap(item => "str" in item ? [item.str + (item.hasEOL ? "\n" : " ")] : []).join("").trim();
          chars += Array.from(text).length;
          if (chars > MATERIAL_TEXT_LIMIT) throw new AiError("response_too_large");
          if (!text && (await pdfPage.getOperatorList()).fnArray.length) needsVision = true;
          pages.push({ page: number, text });
        } finally { pdfPage.cleanup(); }
      }
      return { pages, needsVision, pageCount: pdf.numPages };
    });
  } catch (error) {
    if (error instanceof AiError || deadline.signal.aborted) throw error;
    throw new AiError("invalid_response");
  } finally { deadline.dispose(); await loading?.destroy().catch(() => {}); }
}

const visionSchema = { name: "yeobek_material_pages", definition: {
  type: "object", additionalProperties: false, required: ["pages"], properties: {
    pages: { type: "array", items: { type: "object", additionalProperties: false,
      required: ["page", "text"], properties: { page: { type: "integer" }, text: { type: "string" } } } },
  },
} };

export async function readMaterial(input: { media: NonNullable<AiTextRequest["media"]>; pageCount: number; maxPages: number },
  provider: () => AiTextProvider, signal?: AbortSignal) {
  const flow = startPlaybook("material-read");
  const deadline = createDeadline(50_000, signal);
  const usage: AiProviderTrace[] = [];
  try {
    await flow.step("context.validate", async () => {
      validateMedia(input.media);
      if (!Number.isInteger(input.maxPages) || input.maxPages < 1 || input.maxPages > 20 ||
        !Number.isInteger(input.pageCount) || input.pageCount < 1 || input.pageCount > input.maxPages ||
        (input.media.contentType !== "application/pdf" && input.pageCount !== 1)) throw new AiError("invalid_input");
    });
    const local = await flow.step("document.read", async () => {
      const pdf = input.media.contentType === "application/pdf" ? await readTextPdf(input.media.data, input.maxPages, deadline.signal) : null;
      if (pdf && pdf.pageCount !== input.pageCount) throw new AiError("invalid_input");
      return pdf;
    });
    let pages: MaterialPage[];
    if (local && !local.needsVision) {
      flow.skip("model.generate", "text_pdf");
      pages = local.pages;
    } else {
      pages = await flow.step("model.generate", async () => {
        const result = await abortable(deadline.signal, active => provider().generate({ system: playbookPrompt("material-read"),
          input: JSON.stringify({ pageCount: input.pageCount }), media: input.media, schema: visionSchema,
          signal: active, maxOutputTokens: 8192 }));
        usage.push(result.trace);
        const parsed = resultSchema.safeParse(result.output);
        if (!parsed.success) throw new AiError("invalid_response");
        return parsed.data.pages;
      });
    }
    const chunks = await flow.step("output.validate", async () => {
      deadline.signal.throwIfAborted();
      return materialChunks(pages, input.pageCount);
    });
    return { chunks, method: local && !local.needsVision ? "text_pdf" as const : "vision" as const, usage, steps: flow.finish() };
  } catch (error) {
    flow.fail(error);
    throw error;
  } finally { deadline.dispose(); }
}
