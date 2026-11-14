import { updateInterview } from "@/lib/ai/interview-service";
import { authenticatedDb } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { writeInterviewAnswer } from "@/lib/contracts/interview";
import { uuid } from "@/lib/contracts/requests";
import { requireFeature } from "@/lib/features";

export function PATCH(request: Request, context: { params: Promise<{ id: string; questionId: string }> }) {
  return handleApi(async () => {
    requireFeature("artworkInterview");
    assertSameOrigin(request);
    const db = await authenticatedDb();
    const { id, questionId } = await context.params;
    const input = await readJson(request, writeInterviewAnswer);
    return updateInterview(db, uuid.parse(id), uuid.parse(questionId), input);
  });
}
