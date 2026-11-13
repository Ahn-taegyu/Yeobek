import "server-only";
import { ApiError } from "./api/errors";

const variables = {
  gaps: "FEATURE_GAPS",
  followUpQuestions: "FEATURE_FOLLOW_UP_QUESTIONS",
  opsAggregation: "FEATURE_OPS_AGGREGATION",
  voiceRequired: "FEATURE_VOICE_REQUIRED",
} as const;
export type Feature = keyof typeof variables;
export type Features = Readonly<Record<Feature, boolean>>;

/** Server settings only. Request bodies must never override these values. */
export function getFeatures(env: Readonly<Record<string, string | undefined>> = process.env): Features {
  const entries = Object.entries(variables).map(([feature, variable]) => {
    const value = env[variable]?.trim();
    if (value !== undefined && value !== "true" && value !== "false") {
      throw new ApiError(503, "SERVER_CONFIGURATION_ERROR", "서비스 연결 설정을 확인하고 있습니다.");
    }
    return [feature, value !== "false"] as const;
  });
  return Object.freeze(Object.fromEntries(entries)) as Features;
}

export function requireFeature(feature: Feature, features = getFeatures()): void {
  if (!features[feature]) throw new ApiError(404, "NOT_FOUND", "자료를 찾을 수 없습니다.");
}
