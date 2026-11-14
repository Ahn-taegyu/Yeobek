import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { visitorSessionHash } from "@/lib/api/visitor-session";
import { visitorChatRequest } from "@/lib/contracts/visitor";
import { answerVisitor } from "@/lib/ai/visitor-service";
import { consumeVisitorNetworkBudget } from "@/lib/api/visitor-network";

import { attachVisitorImage } from "@/lib/storage/public-media";

export const runtime = "nodejs";
export const maxDuration = 110;
export function POST(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const input = await readJson(request, visitorChatRequest);
    const session = await visitorSessionHash();
    await consumeVisitorNetworkBudget(request, session, input.exhibitionId, input.requestId, "question");
    return attachVisitorImage(await answerVisitor(input, session, request.signal));
  });
}
