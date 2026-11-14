import { authenticatedContext } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { uuid } from "@/lib/contracts/requests";
import { generateNarrationSchema } from "@/lib/contracts/jobs";
import { generateNarration } from "@/lib/ai/author-service";

export const maxDuration = 150;
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const { db, user } = await authenticatedContext();
    const id = uuid.parse((await context.params).id);
    const result = await generateNarration(db, user.id, id, await readJson(request, generateNarrationSchema), request.signal);
    return { ...result.job, _created: result.created };
  });
}
