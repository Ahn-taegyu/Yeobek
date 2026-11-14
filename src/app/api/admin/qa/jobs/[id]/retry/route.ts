import { authenticatedContext } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { retryJobSchema } from "@/lib/contracts/jobs";
import { uuid } from "@/lib/contracts/requests";
import { retryExpectedQa } from "@/lib/ai/expected-qa-service";
import { loadExpectedQaJob } from "@/lib/ai/stores/expected-qa";
import { requireFeature } from "@/lib/features";

export const maxDuration = 150;
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    requireFeature("expectedQa");
    const { db, user } = await authenticatedContext();
    const id = uuid.parse((await context.params).id);
    const input = await readJson(request, retryJobSchema);
    const job = await loadExpectedQaJob(db, id);
    if (job.artworkId === null) requireFeature("exhibitionQa");
    const result = await retryExpectedQa(user.id, id, input, request.signal);
    return { ...result.job, _created: result.created };
  });
}
