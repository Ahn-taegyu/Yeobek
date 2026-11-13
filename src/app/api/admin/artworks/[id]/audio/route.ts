import { authenticatedContext } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { uuid } from "@/lib/contracts/requests";
import { generateAudioSchema } from "@/lib/contracts/jobs";
import { generateAudio } from "@/lib/ai/audio-service";

export const maxDuration = 180;
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const { db, user } = await authenticatedContext();
    const id = uuid.parse((await context.params).id);
    const result = await generateAudio(db, user.id, id, await readJson(request, generateAudioSchema), request.signal);
    return { ...result.job, _created: result.created };
  });
}
