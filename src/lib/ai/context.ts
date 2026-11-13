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
    score: terms.filter(t => item.body.toLocaleLowerCase("ko").includes(t)).length,
  })).sort((a, b) => b.score - a.score || Number(b.item.scope === "artwork") - Number(a.item.scope === "artwork") || a.index - b.index);
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
const arabicNumber = String.raw`-?[0-9]+`;
const numeral = `(?:${arabicNumber}|[일이삼사오육칠팔구십백천]+)`;
const label = String.raw`(?!이번)${numeral}\s*번`;
const listJoin = String.raw`\s*(?:[,、/]|또는|과|와|이랑|하고|보다)\s*`;
const labelList = `(?:(?:${label}|${arabicNumber})${listJoin})+${label}`;
const standaloneNumber = new RegExp(String.raw`^(?:작품\s*번호\s*${arabicNumber}|(?:작품(?:\s*번호)?\s*)?${label}|${arabicNumber})$`, "u");
const standaloneNumberList = new RegExp(`^${arabicNumber}(?:${listJoin}${arabicNumber})+$`, "u");
const numberCandidate = new RegExp(String.raw`(?<![\p{L}\p{N}-])(?<![0-9]\.)(?:${labelList}|${label})`, "gu");
const candidateNumerals = new RegExp(numeral, "gu");
const initialLabel = new RegExp(String.raw`^${label}[은는을를의도]?\s*`, "u");
const coordinatedLabels = new RegExp(`^(?:${label}${listJoin})+${label}$`, "u");

const requestText = (question: string) => question.trim().replace(/[.!?。]+$/u, "").trimEnd();

// '번' also counts occurrences. In free text, require a nearby artwork cue.
const artworkBeforeNumber = /(?:^|[^\p{L}\p{N}])작품\s*번호\s*$/u;
const artworkTopicAfterNumber = /^\s*[은는이를을의도]?\s*(?:어떤\s*작품|작품(?=$|[\s.,!?。은는이를을도에서의과와])|재료|제목|작가|기법|제작\s*연도|크기|주제|의도|무엇으로\s*만들)/u;
const artworkQuestionAfterNumber = /^(?:[은는이가]\s*(?:뭐야|뭔가요|뭐예요|무엇인가요)[.!?。]*$|에서\s*(?:쓰인|사용한|사용된)|[은는]$)/u;
const narrationAfterNumber = /^\s*[은는을를의도]?\s*(?:기본\s*)?(?:(?:해설|설명|소개)(?=$|[\s을를은는]|해\s*(?:줘|주세요))|알려\s*(?:줘|주세요))/u;
const listComparison = /^\s*[을를의]?\s*(?:비교|차이)/u;
const occurrenceAfterNumber = /^(?:째|이나|씩|에\s*(?:본|봤|봐))|^[을를은는도]?\s*(?:(?:더|다시|왜)\s+)*(?:봐|봤|보았|본|보면|보는|보기|볼|덧칠|반복|전시했|전시됐|관람했)/u;
const possibleReferenceAfterNumber = /^(?:[은는의을를이](?=$|[\s.,!?。])|에서(?=\s)|[\s.,!?。])/u;
const numberedNonArtwork = /^\s*(?:질문|항목|문항|예시|순서)(?=$|[\s.,!?。은는이를을의])/u;

export const isNumberOnly = (question: string): boolean => standaloneNumber.test(requestText(question));

export function resolveIntent(request: { question: string; intent?: "question" | "narration" }): "question" | "narration" {
  if (request.intent !== undefined) return request.intent;
  if (isNumberOnly(request.question)) return "narration";
  return isNarrationRequest(request.question) ? "narration" : "question";
}

export function mentionedNumbers(question: string): { numbers: number[]; invalid: boolean } {
  const text = requestText(question);
  const wholeRequest = standaloneNumber.test(text) || standaloneNumberList.test(text);
  let ambiguous = false;
  const mentions = wholeRequest ? (text.match(candidateNumerals) ?? []) : [...text.matchAll(numberCandidate)].flatMap(match => {
    const [candidate] = match;
    const before = text.slice(0, match.index);
    const after = text.slice(match.index + candidate.length);
    const numerals = candidate.match(candidateNumerals) ?? [];
    if (artworkBeforeNumber.test(before)) return numerals;
    if (numberedNonArtwork.test(after)) return [];
    if (occurrenceAfterNumber.test(after)) return [];
    const clearReference = (!before && /^\s*왜/u.test(after)) ||
      artworkTopicAfterNumber.test(after) || artworkQuestionAfterNumber.test(after) || narrationAfterNumber.test(after) ||
      coordinatedLabels.test(candidate) || (numerals.length > 1 && listComparison.test(after));
    if (clearReference) return numerals;
    if (possibleReferenceAfterNumber.test(after) || /^[은는의](?=\s)/u.test(after)) ambiguous = true;
    return [];
  });
  const values = mentions.map(value => /^-?[0-9]+$/u.test(value) ? Number(value) : koreanNumber(value));
  const numbers = values.filter((value): value is number => value !== null && value >= 1 && value <= 9999);
  return { numbers: [...new Set(numbers)], invalid: ambiguous || numbers.length !== values.length };
}

const artworkTopic = /^(?:(?:이|이번)\s*)?작품(?:에\s*대해(?:서)?|도|을|의|은)?\s*/u;
const narrationCommand = /^(?:기본\s*)?(?:설명|해설|소개)(?:\s*(?:해\s*(?:줘(?:요)?|주세요)|[을를]?\s*(?:부탁(?:해요|합니다|드려요)|들려\s*(?:줘(?:요)?|주세요)|보여\s*(?:줘(?:요)?|주세요)|보기|듣기)))?$/u;

// Match a complete basic request so follow-up questions and transformations survive.
export function isNarrationRequest(question: string): boolean {
  const text = requestText(question);
  if (standaloneNumber.test(text)) return true;
  const prefix = text.match(initialLabel);
  const rest = prefix ? text.slice(prefix[0].length) : text;
  const topic = rest.match(artworkTopic);
  const command = topic ? rest.slice(topic[0].length) : rest;
  return narrationCommand.test(command) || Boolean((prefix || topic) && /^알려\s*(?:줘(?:요)?|주세요)$/u.test(command));
}
