import { authorizeCron } from "@/lib/api/cron";
import { handleApi } from "@/lib/api/http";
import { runNotificationBatch } from "@/lib/automation/runner";

export const maxDuration = 120;
export function POST(request: Request) {
  return handleApi(async () => {
    authorizeCron(request);
    return runNotificationBatch(request.signal);
  });
}
