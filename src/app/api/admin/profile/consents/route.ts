import { authenticatedDb, rpc } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { decodeDatabase } from "@/lib/api/publication";
import { consentListResponse, consentResponse, updateConsentSchema } from "@/lib/contracts/automation";

export function GET() {
  return handleApi(async () => decodeDatabase(consentListResponse,
    await rpc(await authenticatedDb(), "get_contact_consents", {})));
}
export function PATCH(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const db = await authenticatedDb();
    const input = await readJson(request, updateConsentSchema);
    return decodeDatabase(consentResponse, await rpc(db, "set_contact_consent", {
      p_category: input.category, p_granted: input.granted, p_expected_revision: input.expectedRevision,
    }));
  });
}
