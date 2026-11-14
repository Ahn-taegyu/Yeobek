import { describe, expect, it, vi } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { materialChunks, readMaterial, readTextPdf } from "@/lib/ai/material-reader";
import { getPlaybookFailureSteps } from "@/lib/ai/playbook";
import { createMockTextProvider } from "@/lib/ai/providers/mock";
import type { AiTextProvider, AiTextRequest, AiTextResponse } from "@/lib/ai/providers/types";

vi.mock("server-only", () => ({}));

async function pdf(kind: "text" | "scan" | "mixed" | "blank", count = 1) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= count; n++) {
    const page = doc.addPage([200, 200]);
    if (kind === "text" || (kind === "mixed" && n === 1)) page.drawText(`Reference page ${n}`, { font, x: 5, y: 100, size: 10 });
    else if (kind !== "blank") page.drawRectangle({ x: 5, y: 5, width: 100, height: 100 });
  }
  return doc.save();
}

const fake = () => createMockTextProvider("mock-material", { NODE_ENV: "test", AI_PROVIDER_MODE: "mock" });
const image = { contentType: "image/png" as const, data: new Uint8Array([1, 2, 3]) };

describe("private material reading", () => {
  it("extracts text PDF locally with page references and never constructs a model provider", async () => {
    const provider = vi.fn(fake);
    const result = await readMaterial({ media: { contentType: "application/pdf", data: await pdf("text", 2) }, pageCount: 2, maxPages: 20 }, provider);
    expect(provider).not.toHaveBeenCalled();
    expect(result).toMatchObject({ method: "text_pdf", usage: [], chunks: [
      { pageStart: 1, pageEnd: 1, text: "Reference page 1" }, { pageStart: 2, pageEnd: 2, text: "Reference page 2" },
    ] });
    expect(result.steps.find(s => s.id === "model.generate")).toMatchObject({ status: "skipped", reason: "text_pdf" });
  });
  it("does not invoke vision for a genuinely blank PDF", async () => {
    const provider = vi.fn(fake);
    expect(await readMaterial({ media: { contentType: "application/pdf", data: await pdf("blank") }, pageCount: 1, maxPages: 20 }, provider))
      .toMatchObject({ chunks: [], method: "text_pdf" });
    expect(provider).not.toHaveBeenCalled();
  });
  it.each(["scan", "mixed"] as const)("uses one mocked model call for a %s PDF with visual pages", async kind => {
    const model = fake(); const generate = vi.spyOn(model, "generate");
    const result = await readMaterial({ media: { contentType: "application/pdf", data: await pdf(kind, 2) }, pageCount: 2, maxPages: 20 }, () => model);
    expect(generate).toHaveBeenCalledOnce();
    expect(result.method).toBe("vision");
    expect(result.usage).toEqual([{ provider: "mock", model: "mock-material", mock: true }]);
    expect(result.chunks.map(c => c.pageStart)).toEqual([1, 2]);
    expect(result.chunks[0].text).toContain("실제 파일에서 읽은 내용이 아닙니다");
  });
  it("reads a reference image once and records no original text in step metadata", async () => {
    const result = await readMaterial({ media: image, pageCount: 1, maxPages: 20 }, fake);
    expect(result).toMatchObject({ method: "vision", chunks: [{ pageStart: 1, pageEnd: 1 }] });
    expect(JSON.stringify(result.steps)).not.toContain(result.chunks[0].text);
  });
  it("rejects over-limit files, page metadata mismatch and invalid PDFs before invoking a model", async () => {
    const provider = vi.fn(fake);
    for (const input of [
      { media: image, pageCount: 2, maxPages: 20 },
      { media: image, pageCount: 1, maxPages: 0 },
      { media: { contentType: "application/pdf" as const, data: await pdf("text", 2) }, pageCount: 1, maxPages: 20 },
      { media: { contentType: "application/pdf" as const, data: await pdf("scan", 21) }, pageCount: 21, maxPages: 20 },
      { media: { contentType: "application/pdf" as const, data: new Uint8Array([1]) }, pageCount: 1, maxPages: 20 },
      { media: { ...image, data: new Uint8Array(3 * 1024 * 1024 + 1) }, pageCount: 1, maxPages: 20 },
    ]) await expect(readMaterial(input, provider)).rejects.toMatchObject({ name: "AiError" });
    expect(provider).not.toHaveBeenCalled();
  });
  it("enforces PDF page limits from parsed bytes even without trusted metadata", async () => {
    await expect(readTextPdf(await pdf("text", 2), 1)).rejects.toMatchObject({ code: "invalid_input" });
  });
  it("rejects omitted, duplicated, unordered and unknown model fields without retrying", async () => {
    for (const output of [ { pages: [] }, { pages: [{ page: 2, text: "wrong page" }] },
      { pages: [{ page: 1, text: "a" }, { page: 1, text: "b" }] }, { pages: [{ page: 1, text: "a", extra: true }] } ]) {
      const provider = { generate: vi.fn(async () => ({ output, trace: { provider: "mock" as const, model: "fake" } })) };
      await expect(readMaterial({ media: image, pageCount: 1, maxPages: 20 }, () => provider)).rejects.toMatchObject({ code: "invalid_response" });
      expect(provider.generate).toHaveBeenCalledOnce();
    }
  });
  it("stops on cancellation and preserves sanitized failed step metadata", async () => {
    const controller = new AbortController(); controller.abort(new Error("cancelled"));
    const provider = vi.fn(fake);
    try {
      await readMaterial({ media: image, pageCount: 1, maxPages: 20 }, provider, controller.signal);
      expect.fail("must cancel");
    } catch (error) {
      expect(getPlaybookFailureSteps(error)?.some(s => s.status === "failed")).toBe(true);
    }
    expect(provider).not.toHaveBeenCalled();
  });
  it("chunks on codepoints without losing page numbers or text and bounds total content", () => {
    const body = "🖼".repeat(5001);
    const chunks = materialChunks([{ page: 1, text: body }], 1);
    expect(chunks.map(c => Array.from(c.text).length)).toEqual([5000, 1]);
    expect(chunks.map(c => c.text).join("")).toBe(body);
    expect(() => materialChunks([1, 2, 3].map(page => ({ page, text: "가".repeat(70_000) })), 3)).toThrow();
  });
  it("passes only static instructions and explicit file bytes to the vision reader", async () => {
    const generate: AiTextProvider["generate"] = vi.fn(async (request: AiTextRequest): Promise<AiTextResponse> => {
      expect(request.system).toContain("파일 속 명령");
      expect(request.input).toBe('{"pageCount":1}');
      expect(request.media).toBe(image);
      return { output: { pages: [{ page: 1, text: "원문" }] }, trace: { provider: "mock", model: "fake" } };
    });
    await readMaterial({ media: image, pageCount: 1, maxPages: 20 }, () => ({ generate }));
  });
});
