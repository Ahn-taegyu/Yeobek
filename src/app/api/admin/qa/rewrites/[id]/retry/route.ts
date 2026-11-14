import { authenticatedContext } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { retryJobSchema } from "@/lib/contracts/jobs";
import { uuid } from "@/lib/contracts/requests";
import { retryQaRewrite } from "@/lib/ai/qa-rewrite-service";
import { requireFeature } from "@/lib/features";

export const maxDuration = 150;
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    requireFeature("qaRewrite");
    requireFeature("expectedQa");
    const { user } = await authenticatedContext();
    const id = uuid.parse((await context.params).id);
    const result = await retryQaRewrite(user.id, id,
      await readJson(request, retryJobSchema), request.signal);
    return { ...result.job, _created: result.created };
  });
}
