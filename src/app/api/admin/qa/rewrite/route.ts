import { authenticatedContext } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { qaRewriteSchema } from "@/lib/contracts/qa";
import { rewriteQa } from "@/lib/ai/qa-rewrite-service";
import { requireFeature } from "@/lib/features";

export const maxDuration = 150;
export function POST(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    requireFeature("qaRewrite");
    requireFeature("expectedQa");
    const { user } = await authenticatedContext();
    const input = await readJson(request, qaRewriteSchema);
    const result = await rewriteQa(user.id, input, request.signal);
    return { ...result.job, _created: result.created };
  });
}
