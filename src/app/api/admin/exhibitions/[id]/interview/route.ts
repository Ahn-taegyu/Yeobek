import { listExhibitionInterview } from "@/lib/ai/exhibition-interview-service";
import { authenticatedDb } from "@/lib/api/db";
import { handleApi } from "@/lib/api/http";
import { uuid } from "@/lib/contracts/requests";
import { requireFeature } from "@/lib/features";

export function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    requireFeature("artworkInterview");
    return listExhibitionInterview(await authenticatedDb(), uuid.parse((await context.params).id));
  });
}
