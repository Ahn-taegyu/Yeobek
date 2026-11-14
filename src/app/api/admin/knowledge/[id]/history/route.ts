import { authenticatedDb, rpc } from "@/lib/api/db";
import { handleApi } from "@/lib/api/http";
import { decodeDatabase } from "@/lib/api/publication";
import { revision, uuid } from "@/lib/contracts/requests";
import { historyQuery, historyResponse } from "@/lib/contracts/proposals";

export function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const db = await authenticatedDb();
    const id = uuid.parse((await context.params).id);
    const query = historyQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
    return decodeDatabase(historyResponse, await rpc(db, "list_document_history", {
      p_document_id: id, p_before_revision: query.beforeRevision ? revision.parse(Number(query.beforeRevision)) : null,
      p_limit: Number(query.limit ?? 20),
    }));
  });
}
