import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { ApiError } from "../api/errors";

// Technical parser safety caps, separate from configurable business byte limits.
export const FILE_PARSER_LIMITS = Object.freeze({ imagePixels: 40_000_000, pdfPages: 10_000, maxBytes: 50 * 1024 * 1024 });
export type MaterialFileMetadata = {
  contentType: string; byteSize: number; contentHash: string;
  pages: number | null; width: number | null; height: number | null;
};
const invalid = () => new ApiError(400, "INVALID_FILE", "파일 형식이나 내용을 확인해 주세요. JPEG·PNG·WebP 이미지 또는 암호가 없는 PDF를 사용해 주세요.");

/** Never trust the client filename, Content-Type header or a magic-byte check alone. */
export async function validateMaterialFile(bytes: Uint8Array, expected: {
  kind: "image" | "pdf"; contentType: string; byteSize: number;
}): Promise<MaterialFileMetadata> {
  if (!bytes.length || bytes.length > FILE_PARSER_LIMITS.maxBytes || bytes.length !== expected.byteSize) throw invalid();
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const base = { byteSize: bytes.length, contentType: expected.contentType,
    contentHash: createHash("sha256").update(bytes).digest("hex") };
  try {
    if (expected.kind === "pdf") {
      if (expected.contentType !== "application/pdf" || !/^%PDF-[12]\.\d/.test(buffer.subarray(0, 12).toString("ascii")) ||
        !/%%EOF\s*$/.test(buffer.subarray(-1024).toString("latin1"))) throw invalid();
      const document = await PDFDocument.load(bytes, { ignoreEncryption: false, throwOnInvalidObject: true, updateMetadata: false });
      const pages = document.getPageCount();
      if (!Number.isInteger(pages) || pages < 1 || pages > FILE_PARSER_LIMITS.pdfPages) throw invalid();
      return { ...base, pages, width: null, height: null };
    }
    // Reject other parsers (SVG/HEIC/GIF etc.) before native decoding.
    const signatureType = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png"
      : buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff ? "image/jpeg"
        : buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP" ? "image/webp" : null;
    if (signatureType !== expected.contentType) throw invalid();
    const image = sharp(buffer, { failOn: "warning", limitInputPixels: FILE_PARSER_LIMITS.imagePixels, limitInputChannels: 5 });
    const metadata = await image.metadata();
    const formats: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
    if (!metadata.format || formats[metadata.format] !== expected.contentType || !metadata.width || !metadata.height ||
      (metadata.pages ?? 1) !== 1) throw invalid();
    // Force full pixel decoding: metadata alone accepts some truncated files.
    await image.stats();
    return { ...base, pages: null, width: metadata.width, height: metadata.height };
  } catch { throw invalid(); }
}

/** Bounded read even when Storage omits or lies about Content-Length. */
export async function readMaterialResponse(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.ok || !response.body) throw new ApiError(409, "UPLOAD_INCOMPLETE", "파일 전송이 완료되지 않았습니다.");
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > FILE_PARSER_LIMITS.maxBytes) throw invalid();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw invalid(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
