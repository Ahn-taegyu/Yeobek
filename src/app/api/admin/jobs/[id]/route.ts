import { authenticatedDb } from "@/lib/api/db";
import { handleApi } from "@/lib/api/http";
import { uuid } from "@/lib/contracts/requests";
import { loadJob, publicJob } from "@/lib/ai/stores/jobs";

export function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => publicJob(await loadJob(await authenticatedDb(), uuid.parse((await context.params).id))));
}
