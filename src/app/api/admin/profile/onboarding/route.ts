import { authenticatedDb, rpc } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { decodeDatabase } from "@/lib/api/publication";
import { rpcArgs } from "@/lib/api/schemas";
import { updateOnboardingSchema } from "@/lib/contracts/onboarding";
import { profileResponse } from "@/lib/contracts/responses";

export function PATCH(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const db = await authenticatedDb();
    const input = await readJson(request, updateOnboardingSchema);
    return decodeDatabase(profileResponse, await rpc(db, "update_artist_onboarding", rpcArgs(input)));
  });
}
