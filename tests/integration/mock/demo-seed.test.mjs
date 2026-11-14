import { test } from "node:test";
import assert from "node:assert/strict";
import { localStatus } from "../../../scripts/local-supabase.mjs";
import { createClient } from "@supabase/supabase-js";
import { seedDemo } from "../../../scripts/demo-seed.mjs";

test("demo seeds approved public content through HTTP/Storage and reuses it without overwriting", async () => {
  const origin = process.env.TEST_APP_ORIGIN || "http://localhost:3001";
  const status = localStatus();
  const env = { ...process.env, AI_PROVIDER_MODE: "mock", FEATURE_VOICE_REQUIRED: "false", FEATURE_EXPECTED_QA: "true" };
  const created = await seedDemo({ origin, status, env });
  assert.equal(created.reused, false);
  const response = await fetch(`${origin}/api/public/exhibitions/${created.exhibitionId}`, { redirect: "error" });
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.artistDisplayName, "여백 시연 작가");
  assert.deepEqual(data.artworks.map(work => work.number), [1, 2, 3]);
  assert.match(data.introduction, /로컬 개발 시연/);
  const worker = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  for (const work of data.artworks) {
    const context = await worker.rpc("load_publication_context", { p_exhibition_id: created.exhibitionId,
      p_artwork_id: work.id, p_number: null });
    assert.equal(context.error, null);
    assert.ok(context.data.evidence.some(item => item.sourceLabel === "승인 예상 Q&A"), "approved demo QA enters the public snapshot");
    const image = await fetch(`${origin}/api/media/${work.image.id}?kind=image`);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/png");
  }
  const again = await seedDemo({ origin, status, env, saved: created });
  assert.equal(again.exhibitionId, created.exhibitionId);
  assert.equal(again.reused, true);
});
