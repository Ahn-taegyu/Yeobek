import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => ({ rpc: vi.fn(), worker: vi.fn(), dispatch: vi.fn(), notify: vi.fn(), mockPorts: vi.fn(), livePort: vi.fn() }));
vi.mock("@/lib/api/db", () => ({ rpc: mock.rpc }));
vi.mock("@/lib/supabase/worker", () => ({ createWorkerSupabase: mock.worker }));
vi.mock("@/lib/automation/dispatch", () => ({ dispatchOutbox: mock.dispatch }));
vi.mock("@/lib/automation/notification", () => ({ runNotification: mock.notify }));
vi.mock("@/lib/automation/adapters/mock", () => ({ createMockAutomationAdapters: mock.mockPorts }));
vi.mock("@/lib/automation/adapters/stibee", () => ({ createStibeeAdapter: mock.livePort }));
import { runNotificationBatch } from "@/lib/automation/runner";
import { AutomationError } from "@/lib/automation/errors";

const event = { id: "b492f60c-3655-4324-8de2-655f29f78b67", kind: "notify", attempt: 1, mock: true };
const jobId = "b492f60c-3655-4324-8de2-655f29f78b68";
const dispatchCounts = { claimed: 0, accepted: 0, rejected: 0, unknown: 0, failed: 0, skipped: 0, persistenceFailures: 0 };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AI_PROVIDER_MODE", "mock");
  mock.worker.mockReturnValue({});
  mock.mockPorts.mockReturnValue({ mail: { send: vi.fn() } });
  mock.dispatch.mockResolvedValue(dispatchCounts);
  mock.notify.mockResolvedValue({ state: "processed", resultCode: "NOTIFICATION_READY", outbound: null, usage: [], steps: [], elapsedMs: 1 });
  mock.rpc.mockImplementation(async (_db, name) => {
    if (name === "acquire_notification_run") return { signals: 1, events: 1, dispatch: 1 };
    if (name === "schedule_automation_notifications") return { scheduled: 1, discarded: 0 };
    if (name === "claim_automation_notifications") return [event];
    if (name === "reserve_automation_job") return { jobId, attempt: 1, claimed: true };
    if (name === "complete_automation_job") return { event: { state: "suppressed" } };
    return null;
  });
});
afterEach(() => vi.unstubAllEnvs());
const calls = (name: string) => mock.rpc.mock.calls.filter(([, operation]) => operation === name);

it("reports the DB's final policy decision, not the model's processed status", async () => {
  expect(await runNotificationBatch()).toMatchObject({ processed: 0, suppressed: 1, dispatchReady: true });
  expect(mock.livePort).not.toHaveBeenCalled();
  expect(calls("release_notification_run")).toHaveLength(1);
});
it("does not regenerate or contradict a completion whose response was lost", async () => {
  const base = mock.rpc.getMockImplementation()!;
  mock.rpc.mockImplementation(async (...args) => {
    if (args[1] === "complete_automation_job") throw new Error("transport");
    return base(...args);
  });
  expect(await runNotificationBatch()).toMatchObject({ persistenceFailures: 1, failed: 1 });
  expect(mock.notify).toHaveBeenCalledOnce();
  expect(calls("complete_automation_event")).toHaveLength(0);
});
it("retains the global lease after uncertain dispatch persistence, including later dispatch failure", async () => {
  mock.dispatch.mockResolvedValueOnce({ ...dispatchCounts, accepted: 1, persistenceFailures: 1 });
  await runNotificationBatch();
  expect(calls("release_notification_run")).toHaveLength(0);
  mock.dispatch.mockRejectedValueOnce(new Error("later queue failure"));
  await expect(runNotificationBatch()).rejects.toThrow("later queue failure");
  expect(calls("release_notification_run")).toHaveLength(0);
});
it("does not reserve sends before live mail configuration is usable", async () => {
  vi.stubEnv("AI_PROVIDER_MODE", "live");
  const base = mock.rpc.getMockImplementation()!;
  mock.rpc.mockImplementation(async (...args) => args[1] === "claim_automation_notifications" ? [] : base(...args));
  mock.livePort.mockImplementation(() => { throw new AutomationError("not_configured"); });
  expect(await runNotificationBatch()).toMatchObject({ dispatchReady: false });
  expect(mock.dispatch).not.toHaveBeenCalled();
  expect(mock.mockPorts).not.toHaveBeenCalled();
  expect(calls("release_notification_run")).toHaveLength(1);
});
it("forbids production mock before any worker or lease operation", async () => {
  vi.stubEnv("NODE_ENV", "production");
  await expect(runNotificationBatch()).rejects.toMatchObject({ code: "not_configured" });
  expect(mock.worker).not.toHaveBeenCalled();
  expect(mock.rpc).not.toHaveBeenCalled();
});
