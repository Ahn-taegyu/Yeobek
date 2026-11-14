import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

// Offline allowlist export: no answer text, source bodies, raw provider output,
// account identifiers, environment variables or credentials enter the public file.
const args = process.argv.slice(2), options = {};
for (const arg of args) {
  const match = /^--(benchmark|answers|output)=(.+)$/.exec(arg);
  if (!match || options[match[1]]) throw new Error("Use unique --benchmark=path --answers=path --output=path.");
  options[match[1]] = match[2];
}
if (Object.keys(options).length !== 3) throw new Error("Three report paths are required.");
const hash = value => createHash("sha256").update(value).digest("hex");
const benchRaw = readFileSync(options.benchmark, "utf8"), answerRaw = readFileSync(options.answers, "utf8");
const bench = JSON.parse(benchRaw), report = JSON.parse(answerRaw);
if (bench.schemaVersion !== 2 || report.schemaVersion !== 2 || bench.stopped || report.stopped ||
  bench.mode !== "benchmark-free" || report.mode !== "answers-credit" || bench.benchmark.length !== 12 ||
  bench.biviaUsage.calls !== 288 || report.answers.length !== 60 || report.selections.length !== 60 ||
  report.linerUsage.calls.generator !== 120 || report.linerUsage.calls.judge !== (report.judgeCorrection ? 120 + report.judgeFailedAttempts.length : 60) ||
  (report.judgeCorrection && report.correctedJudgeUsage.calls.judge !== 60 + report.judgeFailedAttempts.length) ||
  bench.provenance.corpusHash !== report.provenance.corpusHash) throw new Error("Only complete matching runs can be exported.");
const fields = ["grounded", "complete", "appropriateOutcome", "citationsSupport", "clear"];
const pass = q => fields.every(k => q[k] === true);
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
const quantile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
const latency = values => ({ n: values.length, p50: quantile(values, .5), p95: quantile(values, .95), mean: mean(values) });
const perQuestion = report.answers.map(pair => {
  if (pair.rows.length !== 2 || !pair.judgment || pair.judgeError || new Set(pair.rows.map(r => r.arm)).size !== 2) throw new Error("Incomplete pair.");
  const arms = Object.fromEntries(["A", "C2"].map(arm => {
    const row = pair.rows.find(r => r.arm === arm), q = pair.judgment[pair.blindOrder[0] === arm ? "X" : "Y"];
    if (!row?.answer || row.error || !q || fields.some(k => typeof q[k] !== "boolean")) throw new Error("Invalid answer or judgment.");
    return [arm, { outcome: row.answer.outcome, citations: row.answer.citations.length,
      qualityPass: pass(q), quality: Object.fromEntries(fields.map(k => [k, q[k]])),
      generationAndValidationMs: row.elapsedMs, usage: row.model.trace.usage }];
  }));
  return { questionId: pair.questionId, category: pair.category, answerable: pair.answerable, ...arms };
});
const summarize = rows => Object.fromEntries(["A", "C2"].map(arm => [arm, {
  questions: rows.length, qualityPass: rows.filter(r => r[arm].qualityPass).length,
  qualityPassRate: mean(rows.map(r => Number(r[arm].qualityPass))),
  answerable: rows.filter(r => r.answerable).length,
  answerablePass: rows.filter(r => r.answerable && r[arm].qualityPass).length,
  unknown: rows.filter(r => !r.answerable).length,
  correctUnknownOutcome: rows.filter(r => !r.answerable && r[arm].outcome === "insufficient_evidence" && r[arm].citations === 0).length,
  dimensions: Object.fromEntries(fields.map(k => [k, rows.filter(r => r[arm].quality[k]).length])),
  generationAndValidationMs: latency(rows.map(r => r[arm].generationAndValidationMs)),
} ]));
const wins = perQuestion.filter(r => !r.A.qualityPass && r.C2.qualityPass).map(r => r.questionId);
const losses = perQuestion.filter(r => r.A.qualityPass && !r.C2.qualityPass).map(r => r.questionId);
// Seeded resampling of artwork clusters, retaining paired questions within works.
let seed = 20261114;
const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
const clusters = [...new Set(perQuestion.map(r => r.questionId.split("-")[1]))].map(work => perQuestion.filter(r => r.questionId.split("-")[1] === work));
const samples = Array.from({ length: 10000 }, () => {
  const rows = clusters.flatMap(() => clusters[Math.floor(random() * clusters.length)]);
  return mean(rows.map(r => Number(r.C2.qualityPass) - Number(r.A.qualityPass)));
});
const benchmark = Object.fromEntries([1, 4].map(concurrency => [concurrency, latency(bench.benchmark.filter(r => r.concurrency === concurrency).map(r => r.elapsedMs))]));
const retrieval = Object.fromEntries(["A", "C1", "C2"].map(arm => {
  const rows = report.selections.filter(r => r[arm].metrics.allGroups !== null);
  return [arm, { answerable: rows.length, allGroupsFound: rows.filter(r => r[arm].metrics.allGroups).length,
    groupRecall: mean(rows.map(r => r[arm].metrics.groupRecall)), precision: mean(rows.map(r => r[arm].metrics.precision)) }];
}));
const generationUsd = Object.fromEntries(["A", "C2"].map(arm => [arm, perQuestion.reduce((sum, row) =>
  sum + (row[arm].usage.inputTokens * report.provenance.prices.generator.input + row[arm].usage.outputTokens * report.provenance.prices.generator.output) / 1_000_000, 0)]));
const biviaListUsdPerQuestion = bench.biviaUsage.billableTokens / bench.benchmark.length * .042 / 1_000_000;
const artifact = { schemaVersion: 2, completedAt: report.createdAt,
  provenance: report.provenance, benchmarkProvenance: bench.provenance,
  originalAnswerProvenance: report.originalAnswerProvenance,
  originalAnswerReportHash: report.originalAnswerReportHash, judgeCorrection: report.judgeCorrection,
  judgeFailedAttempts: report.judgeFailedAttempts, judgeExecution: report.judgeExecution,
  privateReportHashes: { answers: hash(answerRaw), benchmark: hash(benchRaw) },
  scope: report.scope, design: report.design, retrieval, benchmarkMs: benchmark,
  answerQuality: summarize(perQuestion), byCategory: Object.fromEntries([...new Set(perQuestion.map(r => r.category))].map(category => [category, summarize(perQuestion.filter(r => r.category === category))])),
  paired: { wins, losses, ties: 60 - wins.length - losses.length, qualityPassDelta: (wins.length - losses.length) / 60,
    artworkClusterBootstrap95: { lower: quantile(samples, .025), upper: quantile(samples, .975), clusters: clusters.length, repetitions: 10000, seed: 20261114 } },
  biviaUsage: bench.biviaUsage, linerUsage: report.linerUsage,
  originalLinerUsage: report.originalLinerUsage, correctedJudgeUsage: report.correctedJudgeUsage,
  productionPriceProjection: { generationUsd, generationMeanUsd: { A: generationUsd.A / 60, C2: generationUsd.C2 / 60 },
    biviaListUsdPerQuestion, c2MeanUsdIncludingBivia: generationUsd.C2 / 60 + biviaListUsdPerQuestion,
    ratioToA: (generationUsd.C2 / 60 + biviaListUsdPerQuestion) / (generationUsd.A / 60),
    note: "List-price projection for 24 score calls per question, excluding experiment judging; Bivia was actually free. Not an invoice or an end-to-end latency measurement." },
  costNote: "Bivia used the checked free allowance. Liner USD covers reported tokens only, excludes usage-unknown requests, and is not verified cash billing. Reservations retain the failed-request allowance.",
  limitations: ["One sample per answer; synthetic previously observed regression set.", "Automated judge, not independent human acceptance.",
    "Grounding flags can penalize retrieval-caused missing facts; they are not a hallucination count.",
    "Benchmark covers six dev questions. Cached answer run does not measure end-to-end live Bivia latency.",
    "No production DB/HTTP/session lifecycle validation."], perQuestion };
writeFileSync(options.output, JSON.stringify(artifact, null, 2) + "\n");
console.log(JSON.stringify({ output: options.output, retrieval, benchmarkMs: benchmark, answerQuality: artifact.answerQuality, paired: artifact.paired, linerUsage: artifact.linerUsage }));
