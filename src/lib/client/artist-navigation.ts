const lifetime = 2 * 60 * 1000;
const limit = 60;

type Entry = {
  controller: AbortController;
  promise: Promise<unknown>;
  value?: unknown;
  expires: number;
};

const pages = new Map<string, Entry>();
let writes = 0;
let pendingWrite: Promise<void> | undefined;
let resolveWrite: (() => void) | undefined;
let generation = 0;
let sessionGeneration = 0;

const channel = typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
  ? new BroadcastChannel("yeobek-artist-navigation") : undefined;

function clear(abort = false) {
  generation++;
  if (abort) {
    sessionGeneration++;
    for (const entry of pages.values()) entry.controller.abort();
  }
  pages.clear();
}

if (channel) channel.onmessage = ({ data }) => {
  clear(data === "auth");
  if (data === "auth" && /^\/artist(?:\/|$)/.test(window.location.pathname)) window.location.reload();
};

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => clear(true));
  window.addEventListener("pageshow", event => {
    if (event.persisted && /^\/artist(?:\/|$)/.test(window.location.pathname)) window.location.reload();
  });
}

export function startArtistWrite() {
  if (writes === 0) pendingWrite = new Promise(resolve => { resolveWrite = resolve; });
  writes++;
  clear();
  return () => {
    writes--;
    clear();
    if (writes === 0) {
      pendingWrite = undefined;
      resolveWrite?.();
      resolveWrite = undefined;
    }
    channel?.postMessage("write");
  };
}

export function clearArtistSession(notify = false) {
  clear(true);
  if (notify) channel?.postMessage("auth");
}

function entryFor(key: string) {
  const entry = pages.get(key);
  return entry && entry.expires > Date.now() ? entry : undefined;
}

export function readArtistPage<T>(key: string): T | undefined {
  return entryFor(key)?.value as T | undefined;
}

export function forgetArtistPage(key: string) {
  pages.delete(key);
}

export function loadArtistPage<T>(key: string, load: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (typeof window === "undefined") return load(signal ?? new AbortController().signal);
  if (signal?.aborted) return Promise.reject(signal.reason);
  const session = sessionGeneration;
  if (pendingWrite) return pendingWrite.then(() => {
    if (session !== sessionGeneration) throw new DOMException("Artist session changed", "AbortError");
    return loadArtistPage(key, load, signal);
  });
  const existing = entryFor(key);
  if (existing) return existing.promise as Promise<T>;
  pages.delete(key);

  const controller = new AbortController();
  const readGeneration = generation;
  const promise = Promise.resolve().then(() => {
    controller.signal.throwIfAborted();
    return load(controller.signal);
  }).then(value => {
    controller.signal.throwIfAborted();
    if (session !== sessionGeneration) throw new DOMException("Artist session changed", "AbortError");
    if (readGeneration !== generation) return loadArtistPage(key, load);
    entry.value = value;
    entry.expires = Date.now() + lifetime;
    return value;
  }).catch(error => {
    if (pages.get(key) === entry) pages.delete(key);
    throw error;
  });
  const entry: Entry = { controller, promise, expires: Infinity };
  const oldest = pages.keys().next().value;
  if (pages.size >= limit && oldest !== undefined) pages.delete(oldest);
  pages.set(key, entry);
  return promise;
}
