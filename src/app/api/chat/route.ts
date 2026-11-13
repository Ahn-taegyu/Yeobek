import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { visitorSessionHash } from "@/lib/api/visitor-session";
import { visitorChatRequest } from "@/lib/contracts/visitor";
import { answerVisitor } from "@/lib/ai/visitor-service";

export const runtime = "nodejs";
export const maxDuration = 180;
export function POST(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const input = await readJson(request, visitorChatRequest);
    return answerVisitor(input, await visitorSessionHash(), request.signal);
  });
}
