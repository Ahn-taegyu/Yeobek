import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("BroadcastChannel", undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("artist navigation data", () => {
  it("shares a prefetch with navigation and renders the prepared result until it expires", async () => {
    const { loadArtistPage, readArtistPage } = await import("../../src/lib/client/artist-navigation");
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    const load = vi.fn(async () => ({ title: "전시" }));
    const prefetch = loadArtistPage("exhibition:one", load);
    expect(loadArtistPage("exhibition:one", load)).toBe(prefetch);
    const data = await prefetch;
    expect(readArtistPage("exhibition:one")).toBe(data);
    expect(await loadArtistPage("exhibition:one", load)).toBe(data);
    expect(load).toHaveBeenCalledTimes(1);
    clock.mockReturnValue(121001);
    expect(readArtistPage("exhibition:one")).toBeUndefined();
    await loadArtistPage("exhibition:one", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("waits for concurrent saves and discards the earlier prefetch", async () => {
    const { startArtistWrite, loadArtistPage, readArtistPage } = await import("../../src/lib/client/artist-navigation");
    const before = Promise.withResolvers<string>();
    const load = vi.fn().mockReturnValueOnce(before.promise).mockResolvedValue("수정 후");
    const prefetch = loadArtistPage("home", load);
    await Promise.resolve();
    const finishFirst = startArtistWrite();
    const finishSecond = startArtistWrite();
    const navigation = loadArtistPage("home", load);
    before.resolve("수정 전");
    finishFirst();
    await Promise.resolve();
    expect(readArtistPage("home")).toBeUndefined();
    expect(load).toHaveBeenCalledTimes(1);
    finishSecond();
    await expect(navigation).resolves.toBe("수정 후");
    await expect(prefetch).resolves.toBe("수정 후");
    expect(readArtistPage("home")).toBe("수정 후");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("drops failed reads and prevents a pending response from surviving a session change", async () => {
    const { clearArtistSession, loadArtistPage, readArtistPage } = await import("../../src/lib/client/artist-navigation");
    await expect(loadArtistPage("profile", async () => { throw new Error("unavailable"); })).rejects.toThrow("unavailable");
    const before = Promise.withResolvers<string>();
    const oldProfile = loadArtistPage("profile", () => before.promise);
    await Promise.resolve();
    clearArtistSession();
    const newProfile = loadArtistPage("profile", async () => "새 계정");
    before.resolve("이전 계정");
    await expect(oldProfile).rejects.toMatchObject({ name: "AbortError" });
    await expect(newProfile).resolves.toBe("새 계정");
    expect(readArtistPage("profile")).toBe("새 계정");
  });
});
