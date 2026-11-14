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
  if (name === "yeobek_artwork_interview") {
    const previous = Array.isArray(data.priorQuestions) ? data.priorQuestions : [];
    const questions = ["이 작품을 만드는 데 어떤 재료를 선택하셨나요?", "작품에 사용한 색에는 어떤 의미가 있나요?",
      "작품을 시작하게 된 계기는 무엇인가요?", "제작 중 가장 오래 고민한 부분은 무엇인가요?", "관람객이 눈여겨볼 부분은 어디인가요?"];
    return { questions: questions.filter(question => !previous.includes(question)).slice(0, Number(data.maxQuestions)) };
  }
  if (name === "yeobek_exhibition_interview") {
    const previous = Array.isArray(data.priorQuestions) ? data.priorQuestions.map(item => String((item as { question?: unknown }).question)) : [];
    const pool = ["이번 전시를 기획하게 된 계기는 무엇인가요?", "전시 제목에 담고 싶었던 의미는 무엇인가요?",
      "작품을 배치할 때 가장 신경 쓴 부분은 무엇인가요?", "관람객이 전시를 보고 무엇을 느끼길 바라시나요?",
      "이번 전시에서 가장 오래 고민한 작품은 무엇인가요?", "작품들을 하나로 묶는 공통된 이야기는 무엇인가요?",
      "작업하면서 새롭게 시도한 재료나 기법이 있나요?", "전시를 준비하며 기억에 남는 순간이 있었나요?",
      "관람객이 먼저 봐 주었으면 하는 작품은 무엇인가요?", "이전 전시와 비교해 달라진 점은 무엇인가요?",
      "작품을 만들 때 영감을 준 장소가 있나요?", "전시의 색감을 정할 때 기준은 무엇이었나요?",
      "관람 동선에 담긴 의도는 무엇인가요?", "가장 개인적인 이야기가 담긴 작품은 무엇인가요?",
      "다음 작업에서 이어가고 싶은 주제는 무엇인가요?"];
    return { questions: pool.filter(question => !previous.includes(question)).slice(0, Number(data.maxQuestions)) };
  }
  if (name === "yeobek_material_pages") {
    if (!Number.isInteger(data.pageCount) || Number(data.pageCount) < 1 || Number(data.pageCount) > 20) throw new AiError("invalid_input");
    return { pages: Array.from({ length: Number(data.pageCount) }, (_, index) => ({
      page: index + 1, text: `개발 시연용 참고 자료 ${index + 1}쪽입니다. 실제 파일에서 읽은 내용이 아닙니다.`,
    })) };
  }
  if (name === "yeobek_expected_qa") {
    const source = excerpts(data.evidence, "body").find(row => codepoints(row.text) <= AI_LIMITS.answer);
    const question = data.scope === "artwork" ? "이 작품에는 어떤 특징이 있나요?" : "이 전시에는 어떤 특징이 있나요?";
    return { items: source ? [{ question, answer: source.text, citations: [source.id] }] : [] };
  }
  if (name === "yeobek_artist_qa_rewrite_judge") {
    const answer = objectValue(data.candidate)?.answer;
    return { grounded: typeof answer === "string" && excerpts(data.evidence, "body").some(row => row.text.includes(answer)) };
  }
  if (name === "yeobek_ops_support_reply") {
    const terms = typeof data.question === "string" ? keywords(data.question) : [];
    const evidence = rows(data.evidence);
    const selected = evidence.find(item => {
      const body = item.body;
      return typeof body === "string" && codepoints(body) <= 2000 && terms.some(term => body.includes(term));
    });
    if (!selected || typeof selected.body !== "string" || typeof selected.id !== "string") return { answer: "", citations: [], category: "escalate" };
    return { answer: selected.body, citations: [selected.id], category: selected.kind === "status" ? "status" : "usage" };
  }
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
    let length = 0;
    const sourceIds = excerpts(data.sources, "text").slice(0, 12).filter(source => {
      const next = length + codepoints(source.text) + (length ? 2 : 0);
      if (next > 5000) return false;
      length = next;
      return true;
    }).map(source => source.id);
    return { sections: sourceIds.length ? [{ id: section, sourceIds }] : [] };
  }
  const withQuestions = name === "yeobek_narration_draft_with_questions";
  const narration = withQuestions || name === "yeobek_narration_draft";
  if (!narration && !["yeobek_docent_answer", "yeobek_artist_preview", "yeobek_artist_qa_rewrite"].includes(name)) throw new AiError("invalid_input");
  const terms = typeof data.question === "string" ? keywords(data.question) : [];
  const source = (narration ? excerpts(data.sources, "text") : excerpts(data.evidence, "body"))
    .find(row => codepoints(row.text) <= (narration ? AI_LIMITS.narration : AI_LIMITS.answer) &&
      (narration || name === "yeobek_artist_qa_rewrite" || terms.some(term => row.text.toLowerCase().includes(term))));
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
