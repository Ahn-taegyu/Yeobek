import { z } from "zod";
import { publicMediaReference, publicMediaReferences } from "./media";
import { revision, section, sourceRefSchema } from "./requests";
import { narrationText } from "./jobs";
import { onboardingKeywordsSchema } from "./onboarding";

const id = z.guid();
const nullableText = z.string().nullable();
const timestamp = z.iso.datetime({ offset: true });
const state = z.enum(["draft", "published", "paused"]);
const number = z.number().int().min(1).max(9999);
const dateRange = { startDate: nullableText, endDate: nullableText, place: nullableText };

const documentWarning = {
  kind: z.literal("document"),
  sectionId: section.shape.id,
  sourceDocumentId: id,
  sourceSectionId: section.shape.id,
  sourceRevision: revision,
};

export const documentResponse = z.object({
  id,
  subjectType: z.enum(["artist", "exhibition", "artwork"]),
  subjectId: id,
  revision,
  sections: z.array(section),
  sourceRefs: z.array(sourceRefSchema(id)),
  sourceWarnings: z.array(z.union([
    z.object({ ...documentWarning, code: z.literal("source_unavailable") }),
    z.object({ ...documentWarning, code: z.literal("source_changed"), currentRevision: revision }),
    z.object({
      kind: z.literal("material"),
      code: z.literal("source_unavailable"),
      sectionId: section.shape.id,
      materialId: id,
    }),
  ])),
  updatedAt: timestamp,
});

const resource = {
  id, revision, createdAt: timestamp, updatedAt: timestamp, document: documentResponse,
};
export const profileResponse = z.object({
  ...resource, displayName: nullableText, artWorldRegistered: z.boolean().optional(),
  fullName: nullableText.optional(), keywords: onboardingKeywordsSchema.optional(),
  onboardingCompletedAt: timestamp.nullable().optional(), onboardingComplete: z.boolean().optional(),
  avatarMaterialId: id.nullable().optional(),
});
export const accountProfileResponse = profileResponse.extend({ accountEmail: nullableText });

const dashboardStatus = z.enum(["preparing", "ongoing", "ended"]);
export const exhibitionResponse = z.object({
  ...resource, ...dateRange, artistId: id, title: z.string(), state,
  draftTitle: nullableText.optional(), startTime: nullableText.optional(), endTime: nullableText.optional(),
  authoringStep: z.enum(["basic", "world", "artworks"]).nullable().optional(),
  posterMaterialId: id.nullable().optional(),
  periodState: z.enum(["unknown", "upcoming", "ongoing", "ended"]).optional(),
  dashboardStatus: dashboardStatus.optional(),
});
const count = z.number().int().nonnegative();
export const exhibitionListItems = z.object({
  items: z.array(exhibitionResponse.extend({ artworkCount: z.number().int().nonnegative() })),
});
export const exhibitionListResponse = exhibitionListItems.extend({
  counts: z.object({ all: count, preparing: count, ongoing: count, ended: count }).optional(),
});

export function countExhibitions(items: readonly { dashboardStatus?: z.infer<typeof dashboardStatus> }[]) {
  const counts = { all: items.length, preparing: 0, ongoing: 0, ended: 0 };
  for (const item of items) counts[item.dashboardStatus ?? "preparing"] += 1;
  return counts;
}

const artwork = {
  id, number, title: z.string(), creationYear: nullableText, medium: nullableText, dimensions: nullableText,
};
export const artworkResponse = z.object({
  ...resource, ...artwork, exhibitionId: id, state, draftTitle: nullableText.optional(),
  dimensionsUnit: nullableText.optional(), draftNumber: number.optional(), imageMaterialId: id.nullable(), narrationDraft: narrationText.nullable(),
});
export const artworkListResponse = z.object({ items: z.array(artworkResponse) });

const publicArtworkSummary = z.object({ ...artwork, publicationId: id,
  image: publicMediaReferences.shape.image.optional(), audio: publicMediaReferences.shape.audio.optional() });
export const publicArtworkResponse = publicArtworkSummary.extend({ narrationText: z.string() });
export const publicExhibitionResponse = z.object({
  id, ...dateRange, title: z.string(), artistDisplayName: z.string(),
  artistBio: nullableText, introduction: nullableText, theme: nullableText,
  startTime: nullableText.optional(), endTime: nullableText.optional(),
  poster: publicMediaReference.extend({ kind: z.literal("poster") }).nullable().optional(),
  artworks: z.array(publicArtworkSummary),
});

export const apiErrorEnvelope = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    retryAfter: z.number().int().nonnegative().optional(),
    fields: z.record(z.string(), z.array(z.string())).optional(),
  }),
  requestId: z.uuid(),
});

export function successEnvelope<Data extends z.ZodType>(data: Data) {
  return z.object({ data, requestId: z.uuid() });
}
