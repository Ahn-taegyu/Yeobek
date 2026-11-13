import { assertSameOrigin, handleApi } from "@/lib/api/http";
import { readTranscription } from "@/lib/api/multipart";
import { visitorSessionHash } from "@/lib/api/visitor-session";
import { transcribeVisitor } from "@/lib/ai/visitor-transcribe-service";
import { withVoiceDeadline } from "@/lib/api/voice-deadline";

export const runtime = "nodejs";
export const maxDuration = 120;
export function POST(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    return withVoiceDeadline(request, async bounded => {
      const input = await readTranscription(bounded);
      return transcribeVisitor(input, await visitorSessionHash(), bounded.signal);
    });
  });
}
