import { describe, expect, it, vi } from "vitest";
import { createLinerTextProvider, createOpenAiTextProvider, createExaoneTextProvider } from "@/lib/ai/providers";
import { resolveAiRoute } from "@/lib/ai/routing";
import type { AiTextRequest } from "@/lib/ai/providers/types";

vi.mock("server-only", () => ({}));
const config = { apiKey: "fixture", model: "fixture" };
const request: AiTextRequest = { system: "Read visible text", input: '{"pageCount":1}',
  schema: { name: "pages", definition: { type: "object" } } };
const output = { pages: [{ page: 1, text: "원문" }] };

describe("bounded media provider transport", () => {
  it.each(["application/pdf", "image/png", "image/jpeg", "image/webp"] as const)("encodes %s inline with fixed file names and store false", async contentType => {
    const media = { contentType, data: new Uint8Array([1, 2, 3]) };
    for (const kind of ["liner", "openai"] as const) {
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(kind === "liner"
        ? { choices: [{ finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(output) } }] }
        : { status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(output) }] }] }));
      const provider = kind === "liner" ? createLinerTextProvider(config, { fetch }) : createOpenAiTextProvider(config, { fetch });
      expect((await provider.generate({ ...request, media })).output).toEqual(output);
      expect(fetch).toHaveBeenCalledOnce();
      const payload = JSON.parse(String(fetch.mock.calls[0][1]?.body));
      expect(payload.store).toBe(false);
      const content = kind === "liner" ? payload.messages[1].content : payload.input[0].content;
      const dataUrl = `data:${contentType};base64,AQID`;
      expect(content[1]).toEqual(contentType === "application/pdf"
        ? kind === "liner" ? { type: "file", file: { filename: "source.pdf", file_data: dataUrl } }
          : { type: "input_file", filename: "source.pdf", file_data: dataUrl }
        : kind === "liner" ? { type: "image_url", image_url: { url: dataUrl } }
          : { type: "input_image", image_url: dataUrl, detail: "auto" });
    }
  });
  it("rejects unsupported providers, empty/oversized bytes and oversized text before network access", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const media = { contentType: "application/pdf" as const, data: new Uint8Array([1]) };
    await expect(createExaoneTextProvider(config, { fetch }).generate({ ...request, media })).rejects.toMatchObject({ code: "invalid_input" });
    for (const provider of [createLinerTextProvider(config, { fetch }), createOpenAiTextProvider(config, { fetch })]) {
      for (const data of [new Uint8Array(), new Uint8Array(6 * 1024 * 1024 + 1)])
        await expect(provider.generate({ ...request, media: { ...media, data } })).rejects.toMatchObject({ code: "invalid_input" });
      await expect(provider.generate({ ...request, media, input: "가".repeat(128_000) })).rejects.toMatchObject({ code: "invalid_input" });
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("selects the documented Liner catalog model and requires explicit supported overrides", () => {
    expect(resolveAiRoute("material", {})).toEqual({ provider: "liner", model: "google/gemini-3.8-flash" });
    expect(resolveAiRoute("material", { AI_ROUTE_MATERIAL: "openai:gpt-example" })).toEqual({ provider: "openai", model: "gpt-example" });
    expect(() => resolveAiRoute("material", { AI_ROUTE_MATERIAL: "exaone:example" })).toThrow();
  });
});
