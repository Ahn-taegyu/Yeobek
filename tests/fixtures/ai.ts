import { createHash } from "node:crypto";
import type { ChatRequestInput, PublicationContext } from "../../src/lib/ai/contracts";

// Entirely fictional evaluation data; never a real artist statement or publication.
export const ids = {
  owner: "10000000-0000-4000-8000-000000000001", exhibition: "10000000-0000-4000-8000-000000000002",
  artwork: "10000000-0000-4000-8000-000000000003", publication: "10000000-0000-4000-8000-000000000004",
  evidence: "10000000-0000-4000-8000-000000000005", other: "10000000-0000-4000-8000-000000000006",
  request: "10000000-0000-4000-8000-000000000007", session: "10000000-0000-4000-8000-000000000008",
};
export const hash = (text: string) => createHash("sha256").update(text).digest("hex");
export function syntheticPublication(): PublicationContext {
  const body = "가상의 평가 작품입니다. 오른쪽 위의 둥근 파란 모양은 달입니다. 재료는 종이와 수채 물감입니다. 작가가 파란색을 선택한 의도는 제공되지 않았습니다.";
  return { ownerId: ids.owner, exhibitionId: ids.exhibition, artworkId: ids.artwork, publicationId: ids.publication,
    version: 1, number: 18, title: "가상 작품: 파란 달", narration: { text: "종이 위 수채 물감으로 표현한 달입니다.", citations: [ids.evidence] },
    evidence: [{ id: ids.evidence, version: 1, ownerId: ids.owner, exhibitionId: ids.exhibition, publicationId: ids.publication,
      artworkId: ids.artwork, scope: "artwork", sourceLabel: "합성 평가 자료", body, contentHash: hash(body) }],
  };
}
export function syntheticRequest(overrides: Partial<ChatRequestInput> = {}): ChatRequestInput {
  return { requestId: ids.request, exhibitionId: ids.exhibition, artworkId: ids.artwork, question: "오른쪽 위의 파란 모양은 무엇인가요?",
    inputMode: "text", outputMode: "text", contextSequence: 2, ...overrides };
}
