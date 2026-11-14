import { generateExhibitionInterview } from "@/lib/ai/exhibition-interview-service";
import { authenticatedContext } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { startInterview } from "@/lib/contracts/interview";
import { uuid } from "@/lib/contracts/requests";
import { requireFeature } from "@/lib/features";

export const maxDuration = 60;

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    requireFeature("artworkInterview");
    assertSameOrigin(request);
    const { db, user } = await authenticatedContext();
    const { requestId } = await readJson(request, startInterview);
    return generateExhibitionInterview(db, user.id, uuid.parse((await context.params).id), requestId, request.signal);
  });
}
