import { authenticatedDb, rpc } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { decodeDatabase } from "@/lib/api/publication";
import { rpcArgs } from "@/lib/api/schemas";
import { setOnboardingMediaSchema } from "@/lib/contracts/onboarding";
import { uuid } from "@/lib/contracts/requests";
import { exhibitionResponse } from "@/lib/contracts/responses";

export function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const db = await authenticatedDb();
    const id = uuid.parse((await context.params).id);
    const input = await readJson(request, setOnboardingMediaSchema);
    return decodeDatabase(exhibitionResponse, await rpc(db, "set_exhibition_poster", rpcArgs({ id, ...input })));
  });
}
