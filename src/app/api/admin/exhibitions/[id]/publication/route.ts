import { authenticatedContext } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { changePublication, loadPublicationChecklist } from "@/lib/api/publication";
import { uuid } from "@/lib/contracts/requests";
import { publicationSchema } from "@/lib/contracts/publication";

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const { db, user } = await authenticatedContext();
    return changePublication(db, user.id, uuid.parse((await context.params).id), await readJson(request, publicationSchema));
  });
}

export function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { db } = await authenticatedContext();
    return loadPublicationChecklist(db, uuid.parse((await context.params).id));
  });
}
