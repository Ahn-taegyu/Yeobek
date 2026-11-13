import { authenticatedContext } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { deleteMaterialSchema } from "@/lib/contracts/materials";
import { uuid } from "@/lib/contracts/requests";
import { deleteMaterial, getMaterialDownload } from "@/lib/storage/materials";

type Context = { params: Promise<{ id: string }> };
export function GET(_request: Request, context: Context) {
  return handleApi(async () => {
    const { user } = await authenticatedContext();
    return getMaterialDownload(user.id, uuid.parse((await context.params).id));
  });
}
export function DELETE(request: Request, context: Context) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const { db, user } = await authenticatedContext();
    const id = uuid.parse((await context.params).id);
    const input = await readJson(request, deleteMaterialSchema);
    return deleteMaterial(db, user.id, id, input.expectedVersion);
  });
}
