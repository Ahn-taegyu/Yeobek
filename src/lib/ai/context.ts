import "server-only";
import { createHash } from "node:crypto";
import { AI_LIMITS, codepoints, publicationContextSchema, type ArtworkSelector, type Evidence, type PublicationContext } from "./contracts";

export class HarnessError extends Error {
  constructor(public readonly code: "invalid_request" | "invalid_context" | "invalid_output" | "publication_unavailable" | "answer_unavailable" | "cancelled") {
    super(code);
    this.name = "HarnessError";
  }
}
export const textHash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
export function assertNotCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new HarnessError("cancelled");
}
export function validateContext(value: unknown, selector: ArtworkSelector): PublicationContext {
  const parsed = publicationContextSchema.safeParse(value);
  if (!parsed.success) throw new HarnessError("invalid_context");
  const context = parsed.data;
  if (context.exhibitionId !== selector.exhibitionId ||
    ("artworkId" in selector && context.artworkId !== selector.artworkId) ||
    ("number" in selector && context.number !== selector.number)) throw new HarnessError("invalid_context");
  const seen = new Set<string>();
  for (const evidence of context.evidence) {
    if (seen.has(evidence.id) || evidence.ownerId !== context.ownerId ||
      evidence.exhibitionId !== context.exhibitionId || evidence.publicationId !== context.publicationId ||
      (evidence.scope === "artwork" ? evidence.artworkId !== context.artworkId : evidence.artworkId !== null) ||
      evidence.contentHash !== textHash(evidence.body)) throw new HarnessError("invalid_context");
    seen.add(evidence.id);
  }
  if (context.narration && (new Set(context.narration.citations).size !== context.narration.citations.length ||
    context.narration.citations.some(id => !seen.has(id)))) throw new HarnessError("invalid_context");
  return context;
}

/** Whole excerpts only: never cut away a negation or separate text from its ID. */
export function selectEvidence(evidence: Evidence[], question: string): Evidence[] {
  const terms = question.toLocaleLowerCase("ko").split(/[^\p{L}\p{N}]+/u).filter(t => t.length > 1);
  const ranked = evidence.map((item, index) => ({ item, index,
    score: (item.scope === "artwork" ? 2 : 0) + terms.filter(t => item.body.toLocaleLowerCase("ko").includes(t)).length,
  })).sort((a, b) => b.score - a.score || a.index - b.index);
  const selected: Evidence[] = [];
  let size = 0;
  for (const { item } of ranked) {
    if (selected.length >= AI_LIMITS.evidenceCount) break;
    const length = codepoints(item.body);
    if (size + length > AI_LIMITS.evidenceChars) continue;
    selected.push(item); size += length;
  }
  return selected;
}

function koreanNumber(value: string): number | null {
  const digits: Record<string, number> = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 };
  const units: Record<string, number> = { 십: 10, 백: 100, 천: 1000 };
  let total = 0, digit = 0, previousUnit = 10000;
  for (const char of value) {
    if (digits[char]) { if (digit) return null; digit = digits[char]; }
    else {
      const unit = units[char];
      if (!unit || unit >= previousUnit) return null;
      total += (digit || 1) * unit; digit = 0; previousUnit = unit;
    }
  }
  return total + digit || null;
}
export function mentionedNumbers(question: string): { numbers: number[]; invalid: boolean } {
  const normalized = question.replace(/번(과|와)(?=[0-9일이삼사오육칠팔구십백천])/gu, "번$1 ");
  const matches = [...normalized.matchAll(/(?<![\p{L}\p{N}])(-?[0-9]+|[일이삼사오육칠팔구십백천]+)\s*번(?=$|[\s.,!?。]|작품|과|와|을|를|의|은|는|에|도|이랑|하고)/gu)]
    .filter(m => m[0] !== "이번"); // '이번 작품' means this work, not work #2.
  const values = matches.map(m => /^\d+$/.test(m[1]) ? Number(m[1]) : koreanNumber(m[1]));
  return { numbers: [...new Set(values.filter((n): n is number => n !== null && n >= 1 && n <= 9999))],
    invalid: values.some(n => n === null || n < 1 || n > 9999) ||
      /[0-9]+\s*(?:[,、/]|또는|와|과)\s*[0-9]+\s*번/u.test(question) };
}
// A narrow fast path: additional questions (e.g. 왜?) must not disappear.
export function isNarrationRequest(question: string): boolean {
  return /^(?:(?:[0-9]+|[일이삼사오육칠팔구십백천]+)\s*번\s*(?:작품)?(?:도)?|이\s*작품)?\s*(?:설명|해설)(?:해\s*줘|해\s*주세요|\s*보기)[.!?。]*$/u.test(question.trim());
}
