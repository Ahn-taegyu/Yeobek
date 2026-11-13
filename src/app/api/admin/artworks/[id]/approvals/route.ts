import { authenticatedDb } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { approveArtwork } from "@/lib/api/publication";
import { uuid } from "@/lib/contracts/requests";
import { approvalSchema } from "@/lib/contracts/publication";

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const db = await authenticatedDb();
    return approveArtwork(db, uuid.parse((await context.params).id), await readJson(request, approvalSchema));
  });
}
