import { createHash } from "node:crypto";
import { z } from "zod";
import type { RetrievalCase } from "../../tests/evaluation/retrieval-cases";
import { parseScore, RERANK_PROMPT, selectScoredEvidence, type ScoredEvidence } from "./bivia-retrieval";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const cacheSchema = z.object({
  schemaVersion: z.literal(1), corpusHash: z.string(), promptHash: z.string(), stopped: z.null(),
  options: z.object({ mode: z.literal("live-free"), split: z.literal("eval"), repeats: z.literal(1) }),
  rows: z.array(z.object({ questionId: z.string(), arm: z.enum(["A", "C"]), repeat: z.literal(0),
    status: z.literal("completed"), scores: z.array(z.unknown()).optional() })),
});

/** Only a hash-pinned completed run with identical corpus and scoring prompt is
 * reusable. IDs are checked exhaustively; partial/duplicate scores fail closed.
 * Cached provider output is data and never supplies requests or instructions.
 */
export function readScoreCache(raw: string, expectedHash: string, allCases: RetrievalCase[]) {
  if (sha256(raw) !== expectedHash) throw new Error("bivia_cache_hash_mismatch");
  const parsed = cacheSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error("bivia_cache_invalid");
  const report = parsed.data;
  if (report.corpusHash !== sha256(JSON.stringify(allCases)) || report.promptHash !== sha256(RERANK_PROMPT)) {
    throw new Error("bivia_cache_inputs_changed");
  }
  const rows = report.rows.filter(r => r.arm === "C"), cases = allCases.filter(c => c.split === "eval");
  if (rows.length !== cases.length || new Set(rows.map(r => r.questionId)).size !== cases.length) throw new Error("bivia_cache_cases_invalid");
  const output = new Map<string, ScoredEvidence[]>();
  for (const c of cases) {
    const row = rows.find(r => r.questionId === c.id);
    if (!row?.scores) throw new Error("bivia_cache_cases_invalid");
    const scores = row.scores.map(rawScore => {
      const id = z.object({ evidenceId: z.uuid() }).parse(rawScore).evidenceId;
      return { evidenceId: id, ...parseScore(rawScore) };
    });
    selectScoredEvidence(c, scores, "tail");
    output.set(c.id, scores);
  }
  return output;
}
