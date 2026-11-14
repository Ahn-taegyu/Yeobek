import { z } from "zod";

/** Optional display widths for images; the original file is returned without `w`. */
export const mediaWidths = ["320", "640", "960"] as const;
export const mediaQuery = z.strictObject({ kind: z.enum(["image", "audio", "poster"]), w: z.enum(mediaWidths).optional() })
  .refine(value => value.kind !== "audio" || value.w === undefined, { path: ["w"], message: "음성 파일은 크기를 바꿀 수 없습니다." });
export const publicMediaReference = z.strictObject({ id: z.uuid(), kind: z.enum(["image", "audio", "poster"]) });
export const publicMediaReferences = z.strictObject({ publicationId: z.uuid(),
  image: publicMediaReference.extend({ kind: z.literal("image") }).nullable(),
  audio: publicMediaReference.extend({ kind: z.literal("audio") }).nullable() });
export const mediaMimeTypes = {
  image: ["image/png", "image/jpeg", "image/webp"],
  audio: ["audio/mpeg"],
} as const;
export const mediaBinary = {
  mimeTypes: [...mediaMimeTypes.image, ...mediaMimeTypes.audio],
  maxBytes: 50 * 1024 * 1024,
} as const;
