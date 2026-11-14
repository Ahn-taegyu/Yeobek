import { z } from "zod";
import { revision, uuid } from "./requests";

export const onboardingKeywordOptions = {
  fields: ["동양화", "서양화", "수묵화", "조각", "사진", "일러스트", "설치미술", "미디어아트", "공예", "기타"],
  moods: ["따뜻한", "차분한", "몽환적인", "서정적인", "실험적인", "강렬한", "미니멀한", "유쾌한", "사색적인"],
  topics: ["자연", "기억", "감정", "관계", "정체성", "상상", "일상", "사회", "시간"],
} as const;

function keywordSelection<const Values extends readonly [string, ...string[]]>(values: Values) {
  return z.array(z.enum(values)).max(values.length)
    .refine(selection => new Set(selection).size === selection.length, "중복된 키워드를 선택할 수 없습니다.");
}

export const onboardingKeywordsSchema = z.strictObject({
  fields: keywordSelection(onboardingKeywordOptions.fields),
  moods: keywordSelection(onboardingKeywordOptions.moods),
  topics: keywordSelection(onboardingKeywordOptions.topics),
});

export const artistName = z.string().trim()
  .refine(value => [...value].length <= 100, "100자 이내로 입력해 주세요.")
  .refine(value => !value.includes("\u0000") &&
    /[^\s\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u.test(value), "보이는 글자를 입력해 주세요.");

export const updateOnboardingSchema = z.strictObject({
  expectedRevision: revision,
  fullName: artistName.nullable(),
  displayName: artistName.nullable(),
  keywords: onboardingKeywordsSchema,
  complete: z.boolean(),
}).superRefine((input, ctx) => {
  if (!input.complete) return;
  if (input.fullName === null) {
    ctx.addIssue({ code: "custom", path: ["fullName"], message: "이름을 입력해 주세요." });
  }
  if (input.displayName === null) {
    ctx.addIssue({ code: "custom", path: ["displayName"], message: "작가명을 입력해 주세요." });
  }
});

export const setOnboardingMediaSchema = z.strictObject({
  expectedRevision: revision,
  materialId: uuid.nullable(),
});
