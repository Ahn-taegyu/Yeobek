import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { visitorSessionHash } from "@/lib/api/visitor-session";
import { speakVisitorAnswer } from "@/lib/ai/visitor-speech-service";
import { speechRequest } from "@/lib/contracts/voice";
import { withVoiceDeadline } from "@/lib/api/voice-deadline";

export const runtime = "nodejs";
export const maxDuration = 120;

export function POST(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    return withVoiceDeadline(request, async bounded => {
      const input = await readJson(bounded, speechRequest);
      return speakVisitorAnswer(input, await visitorSessionHash(), bounded.signal);
    });
  });
}
