import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { readMaterialResponse, validateMaterialFile } from "../../src/lib/storage/validate";

describe("material file verification", () => {
  it.each(["png", "jpeg", "webp"] as const)("decodes actual %s bytes and checks the declared media type", async format => {
    const bytes = await sharp({ create: { width: 16, height: 12, channels: 3, background: "blue" } }).toFormat(format).toBuffer();
    const input = { kind: "image" as const, contentType: `image/${format}`, byteSize: bytes.length };
    expect(await validateMaterialFile(bytes, input)).toMatchObject({ width: 16, height: 12, pages: null, byteSize: bytes.length });
    await expect(validateMaterialFile(bytes, { ...input, contentType: "image/gif" })).rejects.toMatchObject({ code: "INVALID_FILE" });
    await expect(validateMaterialFile(bytes, { ...input, byteSize: bytes.length + 1 })).rejects.toMatchObject({ code: "INVALID_FILE" });
    await expect(validateMaterialFile(bytes.subarray(0, 30), { ...input, byteSize: 30 })).rejects.toMatchObject({ code: "INVALID_FILE" });
  });
  it("counts real PDF pages and rejects a header-only forgery or incomplete file", async () => {
    const document = await PDFDocument.create(); document.addPage(); document.addPage();
    const bytes = await document.save();
    const input = { kind: "pdf" as const, contentType: "application/pdf", byteSize: bytes.length };
    expect(await validateMaterialFile(bytes, input)).toMatchObject({ pages: 2, width: null, height: null });
    const forged = new TextEncoder().encode("%PDF-1.7\nnot a document\n%%EOF");
    await expect(validateMaterialFile(forged, { ...input, byteSize: forged.length })).rejects.toMatchObject({ code: "INVALID_FILE" });
    await expect(validateMaterialFile(bytes.subarray(0, bytes.length - 20), { ...input, byteSize: bytes.length - 20 })).rejects.toMatchObject({ code: "INVALID_FILE" });
  });
  it("blocks an SVG even if declared as an allowed image", async () => {
    const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    await expect(validateMaterialFile(bytes, { kind: "image", contentType: "image/png", byteSize: bytes.length })).rejects.toMatchObject({ code: "INVALID_FILE" });
  });
  it("bounds streamed input independently of Content-Length", async () => {
    const response = new Response(new Uint8Array(12), { headers: { "content-length": "1" } });
    await expect(readMaterialResponse(response, 10)).rejects.toMatchObject({ code: "INVALID_FILE" });
    await expect(readMaterialResponse(new Response(null, { status: 404 }), 10)).rejects.toMatchObject({ code: "UPLOAD_INCOMPLETE" });
  });
});
