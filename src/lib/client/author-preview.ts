import { ApiClientError, requestApi } from "@/lib/client";
import type { ExperienceExhibition, ExperienceTransport } from "@/components/visitor/experience-types";

export async function loadAuthorPreview(id: string, signal: AbortSignal): Promise<ExperienceExhibition> {
  // Always read current drafts; do not revive an earlier editor cache on re-entry.
  const [exhibition, works, profile] = await Promise.all([
    requestApi("getExhibition", { params: { id }, signal }),
    requestApi("listArtworks", { params: { id }, signal }),
    requestApi("getProfile", { signal }),
  ]);
  const draft = exhibition.data;
  return {
    id: draft.id, title: draft.draftTitle ?? draft.title, artistDisplayName: profile.data.displayName ?? "작가",
    place: draft.place, startDate: draft.startDate, endDate: draft.endDate, startTime: draft.startTime, endTime: draft.endTime,
    introduction: draft.document.sections.find(section => section.id === "introduction")?.body ?? null,
    poster: draft.posterMaterialId ? { id: draft.posterMaterialId } : null,
    artworks: works.data.items.map(work => ({ id: work.id, number: work.draftNumber ?? work.number,
      title: work.draftTitle ?? work.title, image: work.imageMaterialId ? { id: work.imageMaterialId } : null,
    })).sort((a, b) => a.number - b.number),
  };
}

export function createAuthorPreviewTransport(exhibition: ExperienceExhibition): ExperienceTransport {
  const speechRequests = new Map<string, string>();
  return {
    async ask(input, signal) {
      const number = /^\s*(\d{1,4})\s*(?:번)?\s*$/.exec(input.question);
      const numbered = number ? exhibition.artworks.find(work => work.number === Number(number[1])) : undefined;
      if (number && !numbered) throw new ApiClientError(404, "NOT_FOUND", "해당 번호의 작품을 찾을 수 없어요.");
      const artworkId = numbered?.id ?? input.artworkId;
      const { data } = await requestApi("previewChat", { params: { id: exhibition.id },
        body: { requestId: input.requestId, artworkId,
          question: numbered || input.intent === "narration" ? "이 작품을 소개해 주세요." : input.question }, signal });
      if (data.status === "running") throw new ApiClientError(409, "REQUEST_IN_PROGRESS", "답변을 준비하고 있어요.", true);
      if (data.status === "failed" || data.status === "cancelled") {
        throw new ApiClientError(502, data.resultCode ?? "AI_GENERATION_FAILED", "답변을 준비하지 못했어요. 다시 질문해 주세요.");
      }
      return { answerId: data.id, answer: data.result?.answer ?? "자료가 부족해 답변하기 어려워요. 작품 정보를 보완해 주세요.",
        artworkId, contextSequence: input.contextSequence, outputMode: input.outputMode,
        canSpeak: data.status === "succeeded" && data.result !== null,
        notice: data.mock ? "모의 응답입니다. 실제 답변 품질은 별도 확인이 필요해요." : undefined };
    },
    async transcribe(body, signal) {
      return (await requestApi("transcribePreview", { params: { id: exhibition.id }, body, signal })).data;
    },
    speak(body, signal) {
      const requestId = speechRequests.get(body.answerId) ?? body.requestId;
      speechRequests.set(body.answerId, requestId);
      return requestApi("speakPreviewAnswer", { params: { id: body.answerId }, body: { requestId }, signal }).catch(error => {
        // An unknown network outcome must replay. A server-confirmed failure may
        // start a new paid attempt only on the next explicit playback click.
        if (error instanceof ApiClientError && error.code === "PREVIEW_VOICE_FAILED") {
          speechRequests.delete(body.answerId);
        }
        throw error;
      });
    },
  };
}
