import { authenticatedContext } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { uuid } from "@/lib/contracts/requests";
import { retryJobSchema } from "@/lib/contracts/jobs";
import { retryNarration } from "@/lib/ai/author-service";

export const maxDuration = 180;
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const { db, user } = await authenticatedContext();
    const id = uuid.parse((await context.params).id);
    return (await retryNarration(db, user.id, id, await readJson(request, retryJobSchema), request.signal)).job;
  });
}
