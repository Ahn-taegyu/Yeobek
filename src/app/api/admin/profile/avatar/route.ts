import { authenticatedDb, rpc } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { decodeDatabase } from "@/lib/api/publication";
import { rpcArgs } from "@/lib/api/schemas";
import { setOnboardingMediaSchema } from "@/lib/contracts/onboarding";
import { profileResponse } from "@/lib/contracts/responses";

export function PATCH(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const db = await authenticatedDb();
    const input = await readJson(request, setOnboardingMediaSchema);
    return decodeDatabase(profileResponse, await rpc(db, "set_artist_avatar", rpcArgs(input)));
  });
}
