import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { visitorSessionHash } from "@/lib/api/visitor-session";
import { speakVisitorAnswer } from "@/lib/ai/visitor-speech-service";
import { speechRequest } from "@/lib/contracts/voice";
import { withVoiceDeadline } from "@/lib/api/voice-deadline";
import { consumeVisitorNetworkBudget } from "@/lib/api/visitor-network";

export const runtime = "nodejs";
export const maxDuration = 90;

export function POST(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    return withVoiceDeadline(request, async bounded => {
      const input = await readJson(bounded, speechRequest);
      const session = await visitorSessionHash();
      return speakVisitorAnswer(input, session, bounded.signal,
        exhibitionId => consumeVisitorNetworkBudget(bounded, session, exhibitionId, input.requestId, "reply_audio"));
    });
  });
}
