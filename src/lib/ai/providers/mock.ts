import "server-only";

import type { AiEnvironment } from "../config";
import { AI_LIMITS, codepoints } from "../contracts";
import { AiError } from "../errors";
import { isMockMode } from "../routing";
import { objectValue, parseJson, SPEECH_CONTENT_TYPE, validateSpeechText } from "./http";
import { recordingExtension } from "./recording";
import type { AiProviderTrace, AiSpeechProvider, AiTextProvider, AiTranscriptionProvider } from "./types";

function trace(model: string, env: AiEnvironment): AiProviderTrace {
  // Also enforce this at the adapter boundary when called without routing.
  if (process.env.NODE_ENV === "production" || !isMockMode(env)) throw new AiError("not_configured");
  return { provider: "mock", model, mock: true };
}

function active(signal?: AbortSignal) {
  if (signal?.aborted) throw new AiError("cancelled");
}

function rows(value: unknown) {
  return Array.isArray(value) ? value.flatMap(item => {
    const row = objectValue(item);
    return row ? [row] : [];
  }) : [];
}

function excerpts(value: unknown, key: "text" | "body") {
  return rows(value).flatMap(row => {
    const text = row[key];
    return typeof row.id === "string" && typeof text === "string" && text.trim()
      ? [{ id: row.id, text: text.trim() }] : [];
  });
}

function keywords(question: string) {
  return (question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .map(term => term.replace(/(?:에서|으로|에게|[이가을를은는의도에])$/u, ""))
    .filter(term => term.length >= 2 && !/^(?:알려|설명|무엇|어떤|있나요|작품|해주세요|알려주세요)$/.test(term));
}

function result(data: Record<string, unknown>, name: string) {
  if (name === "yeobek_ops_notification") {
    return { paragraph: `현재 등록된 작품은 ${data.artworkCount}개입니다. 작가 홈에서 진행 상태를 확인해 주세요.`,
      citations: [data.statusId], outcome: "ready" };
  }
  if (name === "yeobek_narration_evaluations") {
    const sources = excerpts(data.sources, "text");
    return { evaluations: rows(data.candidates).map(candidate => {
      const valid = sources.some(source => typeof candidate.answer === "string" && source.text.includes(candidate.answer) &&
        Array.isArray(candidate.citations) && candidate.citations.length === 1 && candidate.citations[0] === source.id);
      return { candidateId: candidate.candidateId, grounding: valid ? 5 : 1, relevance: valid ? 5 : 1,
        tone: 5, concision: 5, unsupportedIntent: !valid, confidentialityLeak: false };
    }) };
  }
  if (name === "yeobek_knowledge_organization") {
    const section = data.subjectType === "artist" ? "bio" : data.subjectType === "exhibition" ? "introduction" : "description";
    const sourceIds = excerpts(data.sources, "text").slice(0, 12).map(source => source.id);
    return { sections: sourceIds.length ? [{ id: section, sourceIds }] : [] };
  }
  const withQuestions = name === "yeobek_narration_draft_with_questions";
  const narration = withQuestions || name === "yeobek_narration_draft";
  if (!narration && name !== "yeobek_docent_answer") throw new AiError("invalid_input");
  const terms = typeof data.question === "string" ? keywords(data.question) : [];
  const source = (narration ? excerpts(data.sources, "text") : excerpts(data.evidence, "body"))
    .find(row => codepoints(row.text) <= (narration ? AI_LIMITS.narration : AI_LIMITS.answer) &&
      (narration || terms.some(term => row.text.toLowerCase().includes(term))));
  const output = source ? { answer: source.text, citations: [source.id], outcome: "answered" } :
    { answer: "제공된 자료에서 답을 찾지 못했습니다.", citations: [], outcome: "insufficient_evidence" };
  return withQuestions ? { ...output, followUpQuestions: [] } : output;
}

export function createMockTextProvider(model: string, env: AiEnvironment = process.env): AiTextProvider {
  trace(model, env);
  return { async generate({ input, schema, signal }) {
    active(signal);
    const metadata = trace(model, env);
    const data = objectValue(parseJson(input));
    if (!data) throw new AiError("invalid_input");
    return { output: result(data, schema.name), trace: metadata };
  } };
}

export function createMockTranscriptionProvider(env: AiEnvironment = process.env): AiTranscriptionProvider {
  trace("mock-stt", env);
  return { async transcribe({ audio, filename, language, signal }) {
    active(signal);
    const metadata = trace("mock-stt", env);
    recordingExtension(audio, filename, language);
    return { text: "이 작품의 재료를 알려주세요.", trace: metadata };
  } };
}

export function createMockSpeechProvider(env: AiEnvironment = process.env): AiSpeechProvider {
  trace("mock-tts", env);
  return { async synthesize({ text, signal }) {
    active(signal);
    const metadata = trace("mock-tts", env);
    validateSpeechText(text);
    // Eight silent MPEG-1 Layer III mono frames, 32 kb/s at 44.1 kHz.
    const audio = new Uint8Array(8 * 104);
    for (let offset = 0; offset < audio.length; offset += 104) audio.set([0xff, 0xfb, 0x10, 0xc4], offset);
    return { audio, contentType: SPEECH_CONTENT_TYPE, trace: metadata };
  } };
}
