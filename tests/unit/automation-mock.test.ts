import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createMockAutomationAdapters } from "@/lib/automation/adapters/mock";

afterEach(() => vi.unstubAllEnvs());
it("explicit mock mode marks all external effects and returns isolated transcript fixtures", async () => {
  vi.stubEnv("AI_PROVIDER_MODE", "mock");
  const fixture = { noteId: "note-1", revision: 1, text: "합성 자료", segments: [], mock: false };
  const adapters = createMockAutomationAdapters(new Map([[fixture.noteId, fixture]]));
  fixture.text = "changed";
  expect(await adapters.transcript.read("note-1")).toMatchObject({ text: "합성 자료", mock: true });
  expect(await adapters.mail.send({ recipient: "fake@example.test", template: "transactional", paragraph: "안내" })).toMatchObject({ status: "accepted", mock: true });
  expect(await adapters.support.reply({ channelId: "one", chatId: "two", text: "안내" })).toMatchObject({ mock: true });
  await expect(adapters.transcript.read("other")).rejects.toMatchObject({ code: "not_found" });
});
it("rejects implicit mock and blocks adapters again at call time in production", async () => {
  vi.stubEnv("AI_PROVIDER_MODE", "live");
  expect(() => createMockAutomationAdapters()).toThrow("not_configured");
  vi.stubEnv("AI_PROVIDER_MODE", "mock");
  const adapters = createMockAutomationAdapters();
  vi.stubEnv("NODE_ENV", "production");
  expect(() => createMockAutomationAdapters()).toThrow("not_configured");
  await expect(adapters.transcript.read("one")).rejects.toMatchObject({ code: "not_configured" });
});
