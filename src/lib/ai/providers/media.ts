import "server-only";
import { AiError } from "../errors";
import type { AiTextRequest } from "./types";

export function validateMedia(media: NonNullable<AiTextRequest["media"]>): void {
  const max = media.contentType === "application/pdf" ? 6 * 1024 * 1024 : 3 * 1024 * 1024;
  if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(media.contentType) ||
      !(media.data instanceof Uint8Array) || !media.data.byteLength || media.data.byteLength > max) {
    throw new AiError("invalid_input");
  }
}

export function mediaDataUrl(media: NonNullable<AiTextRequest["media"]>): string {
  validateMedia(media);
  return `data:${media.contentType};base64,${Buffer.from(media.data).toString("base64")}`;
}

/** Base64 transport needs a separate bound; ordinary text keeps its 128 KiB cap. */
export function mediaJsonBody(data: Record<string, unknown>): string {
  try {
    const encoded = JSON.stringify(data);
    if (Buffer.byteLength(encoded, "utf8") <= 9 * 1024 * 1024) return encoded;
  } catch { /* Do not expose content-bearing serialization errors. */ }
  throw new AiError("invalid_input");
}
