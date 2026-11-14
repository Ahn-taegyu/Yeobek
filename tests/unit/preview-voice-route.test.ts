import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { POST as transcribe } from "@/app/api/admin/exhibitions/[id]/preview/transcribe/route";
import { POST as speech } from "@/app/api/admin/preview/[id]/speech/route";
const state = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), transcribe: vi.fn(), speak: vi.fn(), feature: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/db", () => ({ authenticatedContext: state.auth }));
vi.mock("@/lib/api/multipart", () => ({ readTranscription: state.read }));
vi.mock("@/lib/features", () => ({ requireFeature: state.feature }));
vi.mock("@/lib/ai/preview-voice-service", () => ({ transcribePreview: state.transcribe, speakPreview: state.speak }));
const id = "dbe48811-59a8-4348-84c9-460687880e36";
const other = "dbe48811-59a8-4348-84c9-460687880e37";
const context = { params: Promise.resolve({ id }) };
const request = (body = "{}", origin = "http://localhost") => new Request("http://localhost/api/test", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body });
beforeEach(() => {
  vi.resetAllMocks(); state.auth.mockResolvedValue({ db: {}, user: { id: other } });
  state.read.mockResolvedValue({ exhibitionId: id }); state.transcribe.mockResolvedValue({ transcript: "안녕" });
  state.speak.mockResolvedValue(new Response("audio", { headers: { "Content-Type": "audio/mpeg" } }));
});
it("requires both flags and binds the multipart exhibition to its path", async () => {
  state.read.mockResolvedValue({ exhibitionId: other });
  const response = await transcribe(request(), context);
  expect(response.status).toBe(400);
  expect(state.feature.mock.calls.map(([name]) => name)).toEqual(["previewExperience", "previewChat"]);
  expect(state.transcribe).not.toHaveBeenCalled();
});
it("keeps disabled and cross-origin requests away from auth and provider", async () => {
  state.feature.mockImplementation(() => { throw new ApiError(404, "NOT_FOUND", "disabled"); });
  expect((await speech(request(), context)).status).toBe(404);
  expect(state.auth).not.toHaveBeenCalled();
  state.feature.mockReset();
  expect((await speech(request("{}", "http://foreign"), context)).status).toBe(403);
  expect(state.speak).not.toHaveBeenCalled();
});
it("returns private binary speech for an authenticated owner", async () => {
  const response = await speech(request(JSON.stringify({ requestId: other })), context);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("audio/mpeg");
  expect(response.headers.get("cache-control")).toContain("private, no-store");
  expect(state.speak).toHaveBeenCalledWith({}, other, id, other, expect.any(AbortSignal));
});
it("rejects unauthenticated requests before provider work", async () => {
  state.auth.mockRejectedValue(new ApiError(401, "UNAUTHENTICATED", "login"));
  expect((await transcribe(request(), context)).status).toBe(401);
  expect(state.transcribe).not.toHaveBeenCalled();
});
