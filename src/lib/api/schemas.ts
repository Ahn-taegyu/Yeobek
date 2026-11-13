import { z } from "zod";

export const uuid = z.uuid();
const revision = z.number().int().positive().max(2147483647);
const shortText = (max: number) => z.string().trim().max(max).nullable().optional().transform(v => v || null);
export const section = z.strictObject({
  id: z.enum(["bio", "practice", "introduction", "theme", "description", "notes"]),
  body: z.string().max(5000),
});
const commonRef = { sectionId: section.shape.id };
export const sourceRef = z.discriminatedUnion("kind", [
  z.strictObject({ ...commonRef, kind: z.literal("direct") }),
  z.strictObject({ ...commonRef, kind: z.literal("material"), materialId: uuid,
    pageStart: z.number().int().min(1).max(2147483647).optional(), pageEnd: z.number().int().min(1).max(2147483647).optional() }),
  z.strictObject({ ...commonRef, kind: z.literal("document"), sourceDocumentId: uuid,
    sourceSectionId: section.shape.id, sourceRevision: revision }),
]);
const knowledge = { sections: z.array(section).max(2), sourceRefs: z.array(sourceRef).max(24) };
const revisions = { expectedRevision: revision, expectedDocumentRevision: revision };
export const loginSchema = z.strictObject({ email: z.email().max(254), password: z.string().min(1).max(1024) });
export const emptySchema = z.strictObject({});
export const profileSchema = z.strictObject({ ...knowledge, ...revisions, displayName: z.string().trim().min(1).max(100) });
const exhibition = { ...knowledge, title: z.string().trim().min(1).max(100),
  startDate: z.iso.date().nullable().optional().transform(v => v ?? null),
  endDate: z.iso.date().nullable().optional().transform(v => v ?? null), place: shortText(200) };
function validateDates(value: { startDate: string | null; endDate: string | null }, context: z.RefinementCtx) {
  if (Boolean(value.startDate) !== Boolean(value.endDate)) {
    context.addIssue({ code: "custom", path: [value.startDate ? "endDate" : "startDate"], message: "시작일과 종료일을 함께 입력해 주세요." });
  } else if (value.startDate && value.endDate && value.startDate > value.endDate) {
    context.addIssue({ code: "custom", path: ["endDate"], message: "종료일은 시작일 이후여야 합니다." });
  }
}
export const createExhibitionSchema = z.strictObject({ ...exhibition, id: uuid }).superRefine(validateDates);
export const updateExhibitionSchema = z.strictObject({ ...exhibition, ...revisions }).superRefine(validateDates);
const artwork = { ...knowledge, number: z.number().int().min(1).max(9999), title: z.string().trim().min(1).max(100),
  creationYear: shortText(50), medium: shortText(200), dimensions: shortText(100) };
export const createArtworkSchema = z.strictObject({ ...artwork, id: uuid });
export const updateArtworkSchema = z.strictObject({ ...artwork, ...revisions });
export const updateKnowledgeSchema = z.strictObject({ ...knowledge, expectedRevision: revision });

export function rpcArgs(input: Record<string, unknown>): Record<string, unknown> {
  const snake = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(snake);
    if (value && typeof value === "object") return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key.replace(/[A-Z]/g, ch => "_" + ch.toLowerCase()), snake(item)]),
    );
    return value;
  };
  return Object.fromEntries(Object.entries(snake(input) as Record<string, unknown>).map(([key, value]) => ["p_" + key, value]));
}
