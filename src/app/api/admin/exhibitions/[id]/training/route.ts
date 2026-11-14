import { authenticatedContext } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { createTrainingBatchSchema } from "@/lib/contracts/qa";
import { uuid } from "@/lib/contracts/requests";
import { createTrainingBatch } from "@/lib/ai/training-service";
import { getFeatures, requireFeature } from "@/lib/features";

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const features = getFeatures();
    requireFeature("expectedQa", features);
    const { user } = await authenticatedContext();
    return createTrainingBatch(user.id, uuid.parse((await context.params).id),
      await readJson(request, createTrainingBatchSchema), features.exhibitionQa);
  });
}
