import { authenticatedDb } from "@/lib/api/db";
import { handleApi } from "@/lib/api/http";
import { uuid } from "@/lib/contracts/requests";
import { loadProposalReview } from "@/lib/ai/stores/proposals";

export function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => loadProposalReview(await authenticatedDb(), uuid.parse((await context.params).id)));
}
