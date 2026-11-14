type Outcome = "answered" | "insufficient_evidence" | "clarify";
type Answerability = "supported" | "missing" | "ambiguous";
export type VisitorEvaluationCandidate = { id: string; outcome: Outcome | (string & {}); evidence: { id: string }[] };
export type VisitorEvaluation = {
  id: string; answerability: Answerability; supportingIds: string[]; grounded: boolean; complete: boolean; reason: string;
  appropriateOutcome: boolean; acceptable: boolean;
};
export const visitorEvaluationPrompt: string;
export const visitorEvaluationSchema: { name: string; definition: unknown };
export function readVisitorEvaluations(raw: unknown, candidates: readonly VisitorEvaluationCandidate[]): VisitorEvaluation[];
