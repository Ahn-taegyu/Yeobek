import { authenticatedContext } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { uuid } from "@/lib/contracts/requests";
import { retryJobSchema } from "@/lib/contracts/jobs";
import { retryNarration } from "@/lib/ai/author-service";
import { retryAudio } from "@/lib/ai/audio-service";
import { loadJob } from "@/lib/ai/stores/jobs";

export const maxDuration = 180;
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const { db, user } = await authenticatedContext();
    const id = uuid.parse((await context.params).id);
    const input = await readJson(request, retryJobSchema);
    const job = await loadJob(db, id);
    return job.kind === "audio" ? (await retryAudio(user.id, id, input, request.signal)).job
      : (await retryNarration(db, user.id, id, input, request.signal)).job;
  });
}
