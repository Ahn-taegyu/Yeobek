import { z } from "zod";
import { createArtworkSchema, createExhibitionSchema, knowledge, revisions, revision, uuid,
  updateArtworkSchema, updateExhibitionSchema } from "./requests";
import { artworkListResponse, exhibitionResponse } from "./responses";

const draftTitle = z.string().trim().max(100)
  .refine(value => !value.includes("\u0000") && (!value || /[^\s\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u.test(value)), "보이는 글자를 입력해 주세요.")
  .nullable().optional().transform(value => value || null);
const time = z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/, "시간을 HH:mm 형식으로 입력해 주세요.")
  .nullable().optional().transform(value => value ?? null);
const exhibitionDraft = {
  ...knowledge, draft: z.literal(true), title: draftTitle,
  startDate: createExhibitionSchema.shape.startDate, endDate: createExhibitionSchema.shape.endDate,
  startTime: time, endTime: time, place: createExhibitionSchema.shape.place,
};
export const createExhibitionDraftSchema = z.strictObject({ ...exhibitionDraft, id: uuid });
export const updateExhibitionDraftSchema = z.strictObject({ ...exhibitionDraft, ...revisions });
export const createExhibitionBody = z.union([createExhibitionSchema, createExhibitionDraftSchema]);
export const updateExhibitionBody = z.union([updateExhibitionSchema, updateExhibitionDraftSchema]);

const artworkDraft = { ...createArtworkSchema.shape, draft: z.literal(true), title: draftTitle,
  number: createArtworkSchema.shape.number.nullable().optional().transform(value => value ?? null),
  dimensionsUnit: z.string().trim().max(20).refine(value => !value.includes("\u0000"))
    .nullable().optional().transform(value => value || null),
};
export const createArtworkDraftSchema = z.strictObject(artworkDraft);
export const updateArtworkDraftSchema = z.strictObject(artworkDraft).omit({ id: true }).extend(revisions);
export const createArtworkBody = z.union([createArtworkSchema, createArtworkDraftSchema]);
export const updateArtworkBody = z.union([updateArtworkSchema, updateArtworkDraftSchema]);
export const advanceExhibitionSchema = z.strictObject({ expectedRevision: revision, step: z.enum(["world", "artworks"]) });
export const advanceExhibitionResponse = z.object({ advanced: z.boolean(), exhibition: exhibitionResponse,
  blockers: z.array(z.object({ code: z.string(), field: z.string() })),
});
export const reorderArtworksSchema = z.strictObject({ items: z.array(z.strictObject({ id: uuid, expectedRevision: revision })).min(1).max(9999) })
  .refine(value => new Set(value.items.map(item => item.id.toLowerCase())).size === value.items.length, "작품이 중복되었습니다.");
export const reorderArtworksResponse = artworkListResponse;
