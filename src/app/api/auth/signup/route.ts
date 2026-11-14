import { handleApi } from "@/lib/api/http";
import { prepareArtistSignup } from "@/lib/api/signup";

export const maxDuration = 60;

export function POST(request: Request) {
  return handleApi(() => prepareArtistSignup(request), 202);
}
