import { authenticatedDb } from "@/lib/api/db";
import { handleApi } from "@/lib/api/http";
import { uuid } from "@/lib/contracts/requests";
import { loadExpectedQaJob } from "@/lib/ai/stores/expected-qa";
import { requireFeature } from "@/lib/features";

export function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    requireFeature("expectedQa");
    return loadExpectedQaJob(await authenticatedDb(), uuid.parse((await context.params).id));
  });
}
