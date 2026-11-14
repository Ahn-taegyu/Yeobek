import { authenticatedContext } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { expectedQaGenerateSchema } from "@/lib/contracts/qa";
import { uuid } from "@/lib/contracts/requests";
import { generateExpectedQa } from "@/lib/ai/expected-qa-service";
import { requireFeature } from "@/lib/features";

export const maxDuration = 150;
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    requireFeature("expectedQa");
    const { user } = await authenticatedContext();
    const input = await readJson(request, expectedQaGenerateSchema);
    if (input.artworkId === null) requireFeature("exhibitionQa");
    const result = await generateExpectedQa(user.id, uuid.parse((await context.params).id), input, request.signal);
    return { ...result.job, _created: result.created };
  });
}
