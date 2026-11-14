import { handleApi } from "@/lib/api/http";
import { uuid } from "@/lib/contracts/requests";
import { mediaQuery } from "@/lib/contracts/media";
import { readPublicMedia } from "@/lib/storage/public-media";
import { ApiError } from "@/lib/api/errors";

export function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const query = new URL(request.url).searchParams;
    if (query.getAll("kind").length !== 1 || query.getAll("w").length > 1) throw new ApiError(400, "INVALID_INPUT", "파일 종류를 확인해 주세요.");
    const { kind, w } = mediaQuery.parse(Object.fromEntries(query));
    return readPublicMedia(uuid.parse((await context.params).id), kind, request.signal, w ? Number(w) : undefined);
  });
}
