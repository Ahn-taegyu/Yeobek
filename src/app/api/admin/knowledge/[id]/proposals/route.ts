import { authenticatedContext } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { uuid } from "@/lib/contracts/requests";
import { generateProposalSchema } from "@/lib/contracts/proposals";
import { generateProposal } from "@/lib/ai/organization-service";

export const maxDuration = 60;
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const { db, user } = await authenticatedContext();
    const id = uuid.parse((await context.params).id);
    const result = await generateProposal(db, user.id, id, await readJson(request, generateProposalSchema), request.signal);
    return { ...result.job, _created: result.created };
  });
}
