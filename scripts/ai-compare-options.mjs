export const CASE_IDS = ["grounded", "missing-intent", "injection", "conflict", "insufficient"];
export function parseCompareOptions(args) {
  const flags = {};
  for (const arg of args) {
    const match = /^--(mode|cases|repeats|max-calls|pricing)=(.+)$/.exec(arg);
    if (!match || Object.hasOwn(flags, match[1])) throw new Error("Use --mode=mock|live --cases=grounded,... --repeats=1 --max-calls=8 [--pricing=path]. No duplicate/unknown options.");
    flags[match[1]] = match[2];
  }
  const mode = flags.mode ?? "mock";
  if (!["mock", "live"].includes(mode)) throw new Error("Mode must be mock or live.");
  const cases = flags.cases?.split(",") ?? (mode === "live" ? ["grounded"] : CASE_IDS);
  if (!cases.length || new Set(cases).size !== cases.length || cases.some(id => !CASE_IDS.includes(id))) throw new Error("Unknown or duplicate synthetic case ID.");
  const repeats = Number(flags.repeats ?? 1);
  if (!/^\d+$/.test(flags.repeats ?? "1") || !Number.isInteger(repeats) || repeats < 1 || repeats > 5) throw new Error("Repeats must be an integer from 1 to 5.");
  const reservedCalls = cases.length * repeats * 8;
  if (mode === "live" && !flags["max-calls"]) throw new Error(`Live comparison requires --max-calls=${reservedCalls} or higher (maximum 200).`);
  const maxCalls = Number(flags["max-calls"] ?? reservedCalls);
  if ((flags["max-calls"] && !/^\d+$/.test(flags["max-calls"])) || !Number.isInteger(maxCalls) || maxCalls < reservedCalls || maxCalls > 200) throw new Error("Call budget must cover all pairs (8 calls each), up to 200.");
  return { mode, cases, repeats, reservedCalls, maxCalls, pricing: flags.pricing ?? null };
}
