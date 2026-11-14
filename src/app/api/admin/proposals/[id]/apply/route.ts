import { authenticatedContext } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { uuid } from "@/lib/contracts/requests";
import { applyProposalSchema } from "@/lib/contracts/proposals";
import { applyProposal } from "@/lib/ai/organization-service";

export const maxDuration = 60;
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const { db, user } = await authenticatedContext();
    const id = uuid.parse((await context.params).id);
    await readJson(request, applyProposalSchema);
    return applyProposal(db, user.id, id, request.signal);
  });
}
