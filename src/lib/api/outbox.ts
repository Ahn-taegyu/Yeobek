import "server-only";
import { authenticatedDb, rpc } from "./db";
import { assertSameOrigin, handleApi, readJson } from "./http";
import { decodeDatabase } from "./publication";
import { decideOutboxSchema, outboxResponse } from "../contracts/automation";
import { uuid } from "../contracts/requests";

export function decideOutbox(request: Request, params: Promise<{ id: string }>, approve: boolean) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const db = await authenticatedDb();
    const input = await readJson(request, decideOutboxSchema);
    return decodeDatabase(outboxResponse, await rpc(db, "decide_outbox", {
      p_id: uuid.parse((await params).id), p_expected_revision: input.expectedRevision, p_approve: approve,
    }));
  });
}
