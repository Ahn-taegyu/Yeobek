import { authenticatedDb, rpc } from "@/lib/api/db";
import { handleApi } from "@/lib/api/http";
import { decodeDatabase } from "@/lib/api/publication";
import { outboxPageResponse, outboxQuery } from "@/lib/contracts/automation";

export function GET(request: Request) {
  return handleApi(async () => {
    const db = await authenticatedDb();
    const query = outboxQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
    return decodeDatabase(outboxPageResponse, await rpc(db, "list_outbox_page", {
      p_limit: 50, p_before: query.cursor ?? null, p_state: query.state,
    }));
  });
}
