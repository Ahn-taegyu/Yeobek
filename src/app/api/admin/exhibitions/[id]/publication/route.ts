import { ensureNarrationAudio } from "@/lib/ai/audio-service";
import { authenticatedContext } from "@/lib/api/db";
import { assertSameOrigin, handleApi, readJson } from "@/lib/api/http";
import { changePublication, loadPublicationChecklist } from "@/lib/api/publication";
import { uuid } from "@/lib/contracts/requests";
import { publicationSchema } from "@/lib/contracts/publication";

// Publishing may first prepare intro audio for the selected artworks.
export const maxDuration = 150;
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const { db, user } = await authenticatedContext();
    const input = await readJson(request, publicationSchema);
    if (input.action === "publish") {
      // Intro audio is always prepared before publishing; audio that is not ready by then leaves the text published alone.
      await Promise.all(input.artworks.map(work =>
        ensureNarrationAudio(db, user.id, work.artworkId, { signal: request.signal, waitMs: 90_000 })));
    }
    return changePublication(db, user.id, uuid.parse((await context.params).id), input);
  });
}

export function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { db } = await authenticatedContext();
    return loadPublicationChecklist(db, uuid.parse((await context.params).id));
  });
}
