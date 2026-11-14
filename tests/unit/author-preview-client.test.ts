import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExperienceExhibition } from "@/components/visitor/experience-types";

const { requestApi, ApiClientError } = vi.hoisted(() => ({ requestApi: vi.fn(), ApiClientError: class extends Error {
  constructor(public status: number | null, public code: string, message: string, public retryable = false) { super(message); }
} }));
vi.mock("@/lib/client", () => ({ ApiClientError, requestApi }));

import { createAuthorPreviewTransport, loadAuthorPreview } from "@/lib/client/author-preview";

const exhibitionId = "11111111-1111-4111-8111-111111111111";
const workId = "22222222-2222-4222-8222-222222222222";
const otherWorkId = "33333333-3333-4333-8333-333333333333";
const answerId = "44444444-4444-4444-8444-444444444444";
const signal = new AbortController().signal;

function exhibitionData() {
  return {
    id: exhibitionId, title: "기존 전시명", draftTitle: "초안 전시명", state: "draft", artistId: otherWorkId,
    place: "서울", startDate: null, endDate: null, startTime: null, endTime: null, posterMaterialId: "poster-material",
    document: { sections: [{ id: "introduction", body: "초안 소개" }] },
  };
}

function artworkData() {
  return { items: [
    { id: workId, number: 1, draftNumber: 8, title: "기존 작품", draftTitle: "초안 작품", imageMaterialId: "work-image",
      state: "draft", narrationDraft: "초안 해설", document: { sections: [] } },
    { id: otherWorkId, number: 2, draftNumber: 3, title: "다른 작품", draftTitle: null, imageMaterialId: null,
      state: "draft", narrationDraft: null, document: { sections: [] } },
  ] };
}

function previewData(overrides: Record<string, unknown> = {}) {
  return { data: { id: answerId, status: "succeeded", result: { answer: "답변", citations: [], mock: false },
    mock: false, resultCode: null, ...overrides } };
}

describe("author preview client", () => {
  beforeEach(() => requestApi.mockReset());

  it("loads and maps private draft resources only", async () => {
    requestApi.mockResolvedValueOnce({ data: exhibitionData() })
      .mockResolvedValueOnce({ data: artworkData() })
      .mockResolvedValueOnce({ data: { displayName: "작가 이름" } });
    const result = await loadAuthorPreview(exhibitionId, signal);
    expect(result).toMatchObject({ id: exhibitionId, title: "초안 전시명", artistDisplayName: "작가 이름",
      introduction: "초안 소개", poster: { id: "poster-material" }, artworks: [
        { id: otherWorkId, number: 3, title: "다른 작품", image: null },
        { id: workId, number: 8, title: "초안 작품", image: { id: "work-image" } },
      ] });
    expect(requestApi.mock.calls.map(([name]) => name).sort()).toEqual(["getExhibition", "getProfile", "listArtworks"]);
    expect(requestApi).toHaveBeenCalledWith("getExhibition", { params: { id: exhibitionId }, signal });
    expect(requestApi).toHaveBeenCalledWith("listArtworks", { params: { id: exhibitionId }, signal });
    expect(requestApi).toHaveBeenCalledWith("getProfile", { signal });
  });

  it("asks through private previewChat and maps a number selection; unknown numbers are rejected", async () => {
    requestApi.mockResolvedValue(previewData());
    const exhibition: ExperienceExhibition = { id: exhibitionId, title: "초안", artistDisplayName: "작가", place: null,
      startDate: null, endDate: null, introduction: null, artworks: [{ id: workId, number: 8, title: "작품" }] };
    const transport = createAuthorPreviewTransport(exhibition);
    await expect(transport.ask({ requestId: answerId, exhibitionId, artworkId: null, question: "8번",
      contextSequence: 4, inputMode: "text", outputMode: "voice" }, signal)).resolves.toMatchObject({
        answerId, answer: "답변", artworkId: workId, contextSequence: 4, canSpeak: true,
      });
    expect(requestApi).toHaveBeenCalledWith("previewChat", { params: { id: exhibitionId },
      body: { requestId: answerId, artworkId: workId, question: "이 작품을 소개해 주세요." }, signal });
    await expect(transport.ask({ requestId: answerId, exhibitionId, artworkId: null, question: "99번",
      contextSequence: 5, inputMode: "text", outputMode: "text" }, signal)).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(requestApi).toHaveBeenCalledTimes(1);
  });

  it("reports running preview work as reusable and abstained replies as not speakable", async () => {
    requestApi.mockResolvedValueOnce(previewData({ status: "running", result: null }))
      .mockResolvedValueOnce(previewData({ status: "abstained", result: null }));
    const exhibition: ExperienceExhibition = { id: exhibitionId, title: "초안", artistDisplayName: "작가", place: null,
      startDate: null, endDate: null, introduction: null, artworks: [] };
    const transport = createAuthorPreviewTransport(exhibition);
    const input = { requestId: answerId, exhibitionId, artworkId: null, question: "질문", contextSequence: 0,
      inputMode: "text" as const, outputMode: "voice" as const };
    await expect(transport.ask(input, signal)).rejects.toMatchObject({ status: 409, code: "REQUEST_IN_PROGRESS", retryable: true });
    await expect(transport.ask({ ...input, requestId: "55555555-5555-4555-8555-555555555555" }, signal))
      .resolves.toMatchObject({ canSpeak: false, answer: expect.any(String) });
  });

  it("transcribes privately and reuses the speech request ID per answer", async () => {
    const exhibition: ExperienceExhibition = { id: exhibitionId, title: "초안", artistDisplayName: "작가", place: null,
      startDate: null, endDate: null, introduction: null, artworks: [] };
    const transport = createAuthorPreviewTransport(exhibition);
    const file = new File(["voice"], "voice.webm", { type: "audio/webm" });
    requestApi.mockResolvedValueOnce({ data: { transcript: "인식 문장", overLimit: false, mock: true } })
      .mockResolvedValueOnce(new Blob(["audio"], { type: "audio/mpeg" }))
      .mockResolvedValueOnce(new Blob(["audio"], { type: "audio/mpeg" }))
      .mockResolvedValueOnce(new Blob(["audio"], { type: "audio/mpeg" }));
    await expect(transport.transcribe({ requestId: answerId, exhibitionId, file }, signal)).resolves.toMatchObject({ transcript: "인식 문장" });
    const firstRequestId = "66666666-6666-4666-8666-666666666666";
    await transport.speak({ requestId: firstRequestId, answerId }, signal);
    await transport.speak({ requestId: "77777777-7777-4777-8777-777777777777", answerId }, signal);
    await transport.speak({ requestId: "88888888-8888-4888-8888-888888888888", answerId: otherWorkId }, signal);
    expect(requestApi).toHaveBeenNthCalledWith(1, "transcribePreview", { params: { id: exhibitionId },
      body: { requestId: answerId, exhibitionId, file }, signal });
    expect(requestApi).toHaveBeenNthCalledWith(2, "speakPreviewAnswer", { params: { id: answerId }, body: { requestId: firstRequestId }, signal });
    expect(requestApi).toHaveBeenNthCalledWith(3, "speakPreviewAnswer", { params: { id: answerId }, body: { requestId: firstRequestId }, signal });
    expect(requestApi).toHaveBeenNthCalledWith(4, "speakPreviewAnswer", { params: { id: otherWorkId },
      body: { requestId: "88888888-8888-4888-8888-888888888888" }, signal });
    const calledRoutes = requestApi.mock.calls.map(([name]) => name);
    for (const publicRoute of ["getPublicExhibition", "chat", "transcribe", "speech", "getMedia"]) {
      expect(calledRoutes).not.toContain(publicRoute);
    }
  });

  it("keeps speech IDs for uncertain outcomes but replaces them only after a confirmed voice failure", async () => {
    const exhibition: ExperienceExhibition = { id: exhibitionId, title: "초안", artistDisplayName: "작가", place: null,
      startDate: null, endDate: null, introduction: null, artworks: [] };
    const transport = createAuthorPreviewTransport(exhibition);
    const firstRequestId = "66666666-6666-4666-8666-666666666666";
    const nextRequestId = "77777777-7777-4777-8777-777777777777";
    requestApi.mockRejectedValueOnce(new ApiClientError(null, "NETWORK_ERROR", "연결 끊김", true))
      .mockRejectedValueOnce(new ApiClientError(409, "REQUEST_IN_PROGRESS", "처리 중", true))
      .mockRejectedValueOnce(new ApiClientError(504, "REQUEST_TIMEOUT", "응답 시간 초과", true))
      .mockRejectedValueOnce(new ApiClientError(200, "INVALID_RESPONSE", "응답 형식 오류"))
      .mockRejectedValueOnce(new ApiClientError(503, "PREVIEW_VOICE_FAILED", "음성 실패", true))
      .mockResolvedValueOnce(new Blob(["audio"], { type: "audio/mpeg" }));

    await expect(transport.speak({ requestId: firstRequestId, answerId }, signal)).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    await expect(transport.speak({ requestId: nextRequestId, answerId }, signal)).rejects.toMatchObject({ code: "REQUEST_IN_PROGRESS" });
    await expect(transport.speak({ requestId: nextRequestId, answerId }, signal)).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
    await expect(transport.speak({ requestId: nextRequestId, answerId }, signal)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(transport.speak({ requestId: nextRequestId, answerId }, signal)).rejects.toMatchObject({ code: "PREVIEW_VOICE_FAILED" });
    await transport.speak({ requestId: nextRequestId, answerId }, signal);

    for (let call = 1; call <= 5; call++) {
      expect(requestApi).toHaveBeenNthCalledWith(call, "speakPreviewAnswer", { params: { id: answerId },
        body: { requestId: firstRequestId }, signal });
    }
    expect(requestApi).toHaveBeenNthCalledWith(6, "speakPreviewAnswer", { params: { id: answerId },
      body: { requestId: nextRequestId }, signal });
  });
});
