import { authenticatedDb } from "@/lib/api/db";
import { handleApi } from "@/lib/api/http";
import { loadReview } from "@/lib/api/publication";
import { uuid } from "@/lib/contracts/requests";

export function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => loadReview(await authenticatedDb(), uuid.parse((await context.params).id)));
}
