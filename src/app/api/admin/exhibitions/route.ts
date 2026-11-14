import { createExhibitionBody } from "@/lib/contracts/authoring";
import { AUTHORING_JSON_BYTES } from "@/lib/contracts/knowledge-sections";
import { authenticatedDb, rpc } from "@/lib/api/db";
import { handleApi, assertSameOrigin, readJson } from "@/lib/api/http";
import { rpcArgs } from "@/lib/api/schemas";

export function GET() {
  return handleApi(async () => ({ items: await rpc(await authenticatedDb(), "list_exhibitions", {}) }));
}
export function POST(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const db = await authenticatedDb();
    const input = await readJson(request, createExhibitionBody, AUTHORING_JSON_BYTES);
    if ("draft" in input) {
      const { draft, ...values } = input;
      void draft;
      return rpc(db, "create_exhibition_draft", rpcArgs(values));
    }
    return rpc(db, "create_exhibition", rpcArgs(input));
  });
}
