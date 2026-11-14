import { assertSameOrigin, handleApi } from "@/lib/api/http";
import { readTranscription } from "@/lib/api/multipart";
import { visitorSessionHash } from "@/lib/api/visitor-session";
import { transcribeVisitor } from "@/lib/ai/visitor-transcribe-service";
import { withVoiceDeadline } from "@/lib/api/voice-deadline";
import { consumeVisitorNetworkBudget } from "@/lib/api/visitor-network";

export const runtime = "nodejs";
export const maxDuration = 90;
export function POST(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    return withVoiceDeadline(request, async bounded => {
      const input = await readTranscription(bounded);
      const session = await visitorSessionHash();
      await consumeVisitorNetworkBudget(bounded, session, input.exhibitionId, input.requestId, "transcription");
      return transcribeVisitor(input, session, bounded.signal);
    });
  });
}
