export const CASE_IDS: string[];
export function parseCompareOptions(args: string[]): {
  mode: "mock" | "live"; cases: string[]; repeats: number; reservedCalls: number; maxCalls: number; pricing: string | null;
};
