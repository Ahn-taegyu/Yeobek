import { authenticatedDb } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { previewEvaluationSchema } from "@/lib/contracts/qa";
import { uuid } from "@/lib/contracts/requests";
import { recordPreviewEvaluation } from "@/lib/ai/preview-service";
import { requireFeature } from "@/lib/features";

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    requireFeature("previewChat");
    const db = await authenticatedDb();
    return recordPreviewEvaluation(db, uuid.parse((await context.params).id), await readJson(request, previewEvaluationSchema));
  });
}
