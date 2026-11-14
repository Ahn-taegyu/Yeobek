import { handleApi } from "@/lib/api/http";
import { resendArtistSignup } from "@/lib/api/signup";

export const maxDuration = 60;

export function POST(request: Request) {
  return handleApi(() => resendArtistSignup(request), 202);
}
