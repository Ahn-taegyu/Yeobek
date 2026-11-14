import { authenticatedContext } from "@/lib/api/db";
import { ApiError } from "@/lib/api/errors";
import { assertSameOrigin, handleApi } from "@/lib/api/http";
import { readTranscription } from "@/lib/api/multipart";
import { withVoiceDeadline } from "@/lib/api/voice-deadline";
import { transcribePreview } from "@/lib/ai/preview-voice-service";
import { uuid } from "@/lib/contracts/requests";
import { requireFeature } from "@/lib/features";

export const runtime = "nodejs";
export const maxDuration = 90;
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    requireFeature("previewExperience");
    requireFeature("previewChat");
    const { user } = await authenticatedContext();
    const exhibition = uuid.parse((await context.params).id);
    return withVoiceDeadline(request, async bounded => {
      const input = await readTranscription(bounded);
      if (input.exhibitionId !== exhibition) throw new ApiError(400, "INVALID_INPUT", "전시 정보가 일치하지 않습니다.");
      return transcribePreview(user.id, input, bounded.signal);
    });
  });
}
