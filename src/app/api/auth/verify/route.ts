import { handleApi } from "@/lib/api/http";
import { verifyArtistSignup } from "@/lib/api/signup";

export const maxDuration = 60;

export function POST(request: Request) {
  return handleApi(() => verifyArtistSignup(request));
}
