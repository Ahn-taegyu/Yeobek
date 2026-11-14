import { authenticatedDb } from "@/lib/api/db";
import { handleApi } from "@/lib/api/http";
import { uuid } from "@/lib/contracts/requests";
import { loadPreviewAnswer } from "@/lib/ai/preview-service";
import { requireFeature } from "@/lib/features";

export function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    requireFeature("previewChat");
    return loadPreviewAnswer(await authenticatedDb(), uuid.parse((await context.params).id));
  });
}
