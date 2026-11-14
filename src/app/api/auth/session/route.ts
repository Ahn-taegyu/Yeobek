import { authenticatedContext } from "@/lib/api/db";
import { ApiError } from "@/lib/api/errors";
import { handleApi } from "@/lib/api/http";

export const maxDuration = 60;

export function GET() {
  return handleApi(async () => {
    try {
      await authenticatedContext();
      return { authenticated: true };
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && error.code === "UNAUTHENTICATED") {
        return { authenticated: false };
      }
      throw error;
    }
  });
}
