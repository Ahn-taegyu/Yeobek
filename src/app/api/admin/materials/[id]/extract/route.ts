import { authenticatedContext } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { uuid } from "@/lib/contracts/requests";
import { materialReadRequest } from "@/lib/contracts/material-extraction";
import { extractMaterial } from "@/lib/ai/material-service";

export const maxDuration = 150;
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const { db, user } = await authenticatedContext();
    return extractMaterial(db, user.id, uuid.parse((await context.params).id), await readJson(request, materialReadRequest), request.signal);
  });
}
