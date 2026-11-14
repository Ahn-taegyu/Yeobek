import { authenticatedContext } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { runTrainingTargetSchema } from "@/lib/contracts/qa";
import { uuid } from "@/lib/contracts/requests";
import { runTrainingTarget } from "@/lib/ai/training-service";
import { getFeatures, requireFeature } from "@/lib/features";

export const maxDuration = 150;
export function POST(request: Request, context: { params: Promise<{ id: string; targetId: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const features = getFeatures();
    requireFeature("expectedQa", features);
    const { db, user } = await authenticatedContext();
    const params = await context.params;
    return runTrainingTarget(db, user.id, uuid.parse(params.id), uuid.parse(params.targetId),
      await readJson(request, runTrainingTargetSchema), features.exhibitionQa, request.signal);
  });
}
