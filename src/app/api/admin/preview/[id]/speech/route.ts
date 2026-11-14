import { z } from "zod";
import { authenticatedContext } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { withVoiceDeadline } from "@/lib/api/voice-deadline";
import { speakPreview } from "@/lib/ai/preview-voice-service";
import { uuid } from "@/lib/contracts/requests";
import { requireFeature } from "@/lib/features";

export const runtime = "nodejs";
export const maxDuration = 90;
const inputSchema = z.strictObject({ requestId: uuid });
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    requireFeature("previewExperience");
    requireFeature("previewChat");
    const { db, user } = await authenticatedContext();
    const id = uuid.parse((await context.params).id);
    return withVoiceDeadline(request, async bounded => speakPreview(db, user.id, id, (await readJson(bounded, inputSchema)).requestId, bounded.signal));
  });
}
