import { authenticatedDb, rpc } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { uuid } from "@/lib/contracts/requests";
import { saveNarrationSchema } from "@/lib/contracts/jobs";

export function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const db = await authenticatedDb();
    const id = uuid.parse((await context.params).id);
    const input = await readJson(request, saveNarrationSchema);
    return rpc(db, "save_narration_draft", { p_artwork_id: id, p_expected_revision: input.expectedRevision,
      p_text: input.text, p_source_job_id: input.sourceJobId ?? null });
  });
}
