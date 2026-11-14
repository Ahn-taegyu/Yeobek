import { authenticatedDb, rpc } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { ApiError } from "@/lib/api/errors";
import { decodeDatabase } from "@/lib/api/publication";
import { channelIdentifier, supportBindingResponse, supportBindingSchema } from "@/lib/contracts/support";

export function POST(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const db = await authenticatedDb();
    const body = await readJson(request, supportBindingSchema);
    const channelId = process.env.CHANNEL_TALK_CHANNEL_ID;
    if (!channelIdentifier.safeParse(channelId).success) throw new ApiError(503, "SERVER_CONFIGURATION_ERROR", "연결 설정을 확인하고 있습니다.");
    return decodeDatabase(supportBindingResponse, await rpc(db, "set_support_binding", {
      p_channel_id: channelId, p_user_id: body.userId, p_owner: body.ownerId,
      p_enabled: body.enabled, p_expected_revision: body.expectedRevision,
    }));
  });
}
