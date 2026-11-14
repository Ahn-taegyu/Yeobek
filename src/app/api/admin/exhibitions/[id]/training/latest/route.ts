import { authenticatedDb } from "@/lib/api/db";
import { handleApi } from "@/lib/api/http";
import { uuid } from "@/lib/contracts/requests";
import { loadLatestTrainingBatch } from "@/lib/ai/training-service";
import { requireFeature } from "@/lib/features";

export function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    requireFeature("expectedQa");
    return loadLatestTrainingBatch(await authenticatedDb(), uuid.parse((await context.params).id));
  });
}
