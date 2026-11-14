import { z } from "zod";
import { MAX_SECTIONS, SECTION_IDS, sectionById } from "./knowledge-sections";

export const uuid = z.uuid();
export const revision = z.number().int().positive().max(2147483647);
const text = () => z.string().refine(v => !v.includes("\u0000"), "지원되지 않는 문자가 포함되어 있습니다.");
const shortText = (max: number) => text().trim().max(max).nullable().optional().transform(v => v || null);
const visibleText = (value: string) => /[^\s\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u.test(value);
const title = text().trim().min(1).max(100).refine(visibleText, "보이는 글자를 입력해 주세요.");
const date = z.iso.date().refine(v => !v.startsWith("0000-"), "연도는 1년 이상이어야 합니다.");
export const section = z.strictObject({
  id: z.enum(SECTION_IDS),
  // Validate normalized length; SQL stores the normalized body. Keeping raw input
  // here also preserves creation replay fingerprints from older clients.
  body: text(),
}).superRefine((value, context) => {
  const max = sectionById.get(value.id)!.maxLength;
  if (Array.from(value.body.trim()).length > max) context.addIssue({ code: "custom", path: ["body"], message: `본문은 앞뒤 공백을 제외하고 ${max.toLocaleString("ko-KR")}자 이내로 입력해 주세요.` });
});
const commonRef = { sectionId: section.shape.id };
export const sourceRefSchema = (id: typeof uuid | ReturnType<typeof z.guid>) => z.discriminatedUnion("kind", [
  z.strictObject({ ...commonRef, kind: z.literal("direct") }),
  z.strictObject({ ...commonRef, kind: z.literal("material"), materialId: id,
    pageStart: z.number().int().min(1).max(2147483647).optional(), pageEnd: z.number().int().min(1).max(2147483647).optional() }),
  z.strictObject({ ...commonRef, kind: z.literal("document"), sourceDocumentId: id,
    sourceSectionId: section.shape.id, sourceRevision: revision }),
]);
export const sourceRef = sourceRefSchema(uuid);
export const knowledge = { sections: z.array(section).max(MAX_SECTIONS), sourceRefs: z.array(sourceRef).max(24) };
export const revisions = { expectedRevision: revision, expectedDocumentRevision: revision };
export const loginSchema = z.strictObject({ email: z.email().max(254), password: text().min(1).max(1024) });
export const emptySchema = z.strictObject({});
export const profileSchema = z.strictObject({ ...knowledge, ...revisions,
  displayName: shortText(100).refine(v => v === null || visibleText(v), "보이는 글자를 입력해 주세요.") });
const exhibition = { ...knowledge, title,
  startDate: date.nullable().optional().transform(v => v ?? null),
  endDate: date.nullable().optional().transform(v => v ?? null), place: shortText(200) };
function validateDates(value: { startDate: string | null; endDate: string | null }, context: z.RefinementCtx) {
  if (Boolean(value.startDate) !== Boolean(value.endDate)) {
    context.addIssue({ code: "custom", path: [value.startDate ? "endDate" : "startDate"], message: "시작일과 종료일을 함께 입력해 주세요." });
  } else if (value.startDate && value.endDate && value.startDate > value.endDate) {
    context.addIssue({ code: "custom", path: ["endDate"], message: "종료일은 시작일 이후여야 합니다." });
  }
}
export const createExhibitionSchema = z.strictObject({ ...exhibition, id: uuid }).superRefine(validateDates);
export const updateExhibitionSchema = z.strictObject({ ...exhibition, ...revisions }).superRefine(validateDates);
const artwork = { ...knowledge, number: z.number().int().min(1).max(9999), title,
  creationYear: shortText(50), medium: shortText(200), dimensions: shortText(100) };
export const createArtworkSchema = z.strictObject({ ...artwork, id: uuid });
export const updateArtworkSchema = z.strictObject({ ...artwork, ...revisions });
export const updateKnowledgeSchema = z.strictObject({ ...knowledge, expectedRevision: revision });
