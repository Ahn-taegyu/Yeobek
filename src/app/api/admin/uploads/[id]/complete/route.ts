import { authenticatedContext } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { completeUploadSchema } from "@/lib/contracts/materials";
import { uuid } from "@/lib/contracts/requests";
import { completeMaterialUpload } from "@/lib/storage/materials";

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const { user } = await authenticatedContext();
    const id = uuid.parse((await context.params).id);
    const input = await readJson(request, completeUploadSchema);
    return completeMaterialUpload(user.id, id, input.expectedVersion);
  });
}
