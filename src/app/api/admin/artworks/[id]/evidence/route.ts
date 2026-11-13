import { authenticatedDb } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { upsertEvidence } from "@/lib/api/publication";
import { uuid } from "@/lib/contracts/requests";
import { upsertEvidenceSchema } from "@/lib/contracts/publication";

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const db = await authenticatedDb();
    return upsertEvidence(db, uuid.parse((await context.params).id), await readJson(request, upsertEvidenceSchema));
  }, 201);
}
