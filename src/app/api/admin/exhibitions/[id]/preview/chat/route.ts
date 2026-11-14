import { authenticatedContext } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { previewChatSchema } from "@/lib/contracts/qa";
import { uuid } from "@/lib/contracts/requests";
import { answerPreview } from "@/lib/ai/preview-service";
import { requireFeature } from "@/lib/features";

export const maxDuration = 150;
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    requireFeature("previewChat");
    const { user } = await authenticatedContext();
    const result = await answerPreview(user.id, uuid.parse((await context.params).id),
      await readJson(request, previewChatSchema), request.signal);
    return { ...result.job, _created: result.created };
  });
}
