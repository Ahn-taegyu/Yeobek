import { test } from "node:test";
import assert from "node:assert/strict";
import { localStatus } from "../../../scripts/local-supabase.mjs";
import { seedDemo } from "../../../scripts/demo-seed.mjs";

test("demo seeds approved public content through HTTP/Storage and reuses it without overwriting", async () => {
  const origin = process.env.TEST_APP_ORIGIN || "http://localhost:3001";
  const status = localStatus();
  const env = { ...process.env, AI_PROVIDER_MODE: "mock", FEATURE_VOICE_REQUIRED: "false" };
  const created = await seedDemo({ origin, status, env });
  assert.equal(created.reused, false);
  const response = await fetch(`${origin}/api/public/exhibitions/${created.exhibitionId}`, { redirect: "error" });
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.artistDisplayName, "여백 시연 작가");
  assert.deepEqual(data.artworks.map(work => work.number), [1, 2, 3]);
  assert.match(data.introduction, /로컬 개발 시연/);
  for (const work of data.artworks) {
    const image = await fetch(`${origin}/api/media/${work.image.id}?kind=image`);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/png");
  }
  const again = await seedDemo({ origin, status, env, saved: created });
  assert.equal(again.exhibitionId, created.exhibitionId);
  assert.equal(again.reused, true);
});
