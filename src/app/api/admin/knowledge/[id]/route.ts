import { AUTHORING_JSON_BYTES } from "@/lib/contracts/knowledge-sections";
import { authenticatedDb, documentSubject, rpc } from "@/lib/api/db";
import { handleApi, assertSameOrigin, readJson } from "@/lib/api/http";
import { updateKnowledgeSchema, uuid, rpcArgs } from "@/lib/api/schemas";

type Context = { params: Promise<{ id: string }> };
export function GET(_request: Request, context: Context) {
  return handleApi(async () => {
    const db = await authenticatedDb();
    const subject = await documentSubject(db, uuid.parse((await context.params).id));
    return rpc(db, "get_knowledge_document", subject);
  });
}
export function PATCH(request: Request, context: Context) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const db = await authenticatedDb();
    const subject = await documentSubject(db, uuid.parse((await context.params).id));
    return rpc(db, "update_knowledge_document", { ...subject, ...rpcArgs(await readJson(request, updateKnowledgeSchema, AUTHORING_JSON_BYTES)) });
  });
}
