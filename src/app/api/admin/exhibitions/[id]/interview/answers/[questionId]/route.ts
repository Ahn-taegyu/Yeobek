import { answerExhibitionInterview } from "@/lib/ai/exhibition-interview-service";
import { authenticatedDb } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { writeExhibitionInterviewAnswer } from "@/lib/contracts/exhibition-interview";
import { uuid } from "@/lib/contracts/requests";
import { requireFeature } from "@/lib/features";

export function PATCH(request: Request, context: { params: Promise<{ id: string; questionId: string }> }) {
  return handleApi(async () => {
    requireFeature("artworkInterview");
    assertSameOrigin(request);
    const db = await authenticatedDb();
    const { id, questionId } = await context.params;
    return answerExhibitionInterview(db, uuid.parse(id), uuid.parse(questionId), await readJson(request, writeExhibitionInterviewAnswer));
  });
}
