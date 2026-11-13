import { authenticatedContext } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { requestUploadSchema } from "@/lib/contracts/materials";
import { requestMaterialUpload } from "@/lib/storage/materials";

export function POST(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const { user } = await authenticatedContext();
    return requestMaterialUpload(user.id, await readJson(request, requestUploadSchema));
  });
}
