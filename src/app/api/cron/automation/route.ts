import { authorizeCron } from "@/lib/api/cron";
import { handleApi } from "@/lib/api/http";
import { runNotificationBatch } from "@/lib/automation/runner";
import { runSupportBatch } from "@/lib/automation/support-runner";

export const maxDuration = 120;
export function POST(request: Request) {
  return handleApi(async () => {
    authorizeCron(request);
    const [notifications, support] = await Promise.all([runNotificationBatch(request.signal), runSupportBatch(request.signal)]);
    return { ...notifications, support };
  });
}
