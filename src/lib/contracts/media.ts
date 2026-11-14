import { z } from "zod";

export const mediaQuery = z.strictObject({ kind: z.enum(["image", "audio", "poster"]) });
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
