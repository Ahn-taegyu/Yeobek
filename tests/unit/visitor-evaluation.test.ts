import { describe, expect, it } from "vitest";
import { readVisitorEvaluations } from "../../scripts/visitor-evaluation.mjs";

const candidates = [
  { id: "a", outcome: "insufficient_evidence", evidence: [{ id: "source-a" }] },
  { id: "b", outcome: "insufficient_evidence", evidence: [{ id: "source-b" }] },
  { id: "c", outcome: "answered", evidence: [{ id: "source-c" }] },
];

const evaluations = [
  { id: "a", answerability: "missing", supportingIds: [], grounded: true, complete: false, reason: "해당 기록 없음" },
  { id: "b", answerability: "supported", supportingIds: ["source-b"], grounded: true, complete: false, reason: "정확한 기록 있음" },
  { id: "c", answerability: "supported", supportingIds: ["source-c"], grounded: true, complete: false, reason: "질문의 일부가 빠짐" },
];

describe("offline visitor evaluation", () => {
  it("accepts a warranted abstention and distinguishes overabstention from an incomplete answer", () => {
    expect(readVisitorEvaluations({ evaluations }, candidates)).toMatchObject([
      { id: "a", appropriateOutcome: true, acceptable: true },
      { id: "b", appropriateOutcome: false, acceptable: false },
      { id: "c", appropriateOutcome: true, acceptable: false },
    ]);
  });

  it("rejects invented candidate IDs and supporting evidence from another candidate", () => {
    expect(() => readVisitorEvaluations({ evaluations: [evaluations[0], evaluations[1], { ...evaluations[2], id: "d" }] },
      candidates)).toThrow("Unknown or duplicate evaluation candidate");
    expect(() => readVisitorEvaluations({ evaluations: [evaluations[0], { ...evaluations[1], supportingIds: ["source-c"] }, evaluations[2]] },
      candidates)).toThrow("Invalid candidate evaluation evidence");
  });
});
