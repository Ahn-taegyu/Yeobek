import { test } from "node:test";
import assert from "node:assert/strict";
import { assertDemoEnvironment, localOrigin } from "../../scripts/demo-seed.mjs";
const local = { API_URL: "http://127.0.0.1:54321", SERVICE_ROLE_KEY: "test-only", ANON_KEY: "test-only" };
const env = { AI_PROVIDER_MODE: "mock", FEATURE_VOICE_REQUIRED: "false" };
test("demo rejects production and remote destinations before any I/O", () => {
  for (const url of ["https://example.com", "http://localhost.evil.test", "http://localhost@evil.test", "http://localhost/path", "http://localhost?target=prod", "https://localhost", "http://user:pass@localhost", "file:///tmp/a"]) {
    assert.throws(() => localOrigin(url));
  }
  for (const override of [{ NODE_ENV: "production" }, { VERCEL_ENV: "production" }, { AI_PROVIDER_MODE: "live" },
    { FEATURE_VOICE_REQUIRED: "true" }, { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" }, { NEXT_PUBLIC_SUPABASE_URL: "http://localhost:9999" }]) {
    assert.throws(() => assertDemoEnvironment("http://localhost:3001", local, { ...env, ...override }));
  }
  assert.throws(() => assertDemoEnvironment("http://localhost:3001", { ...local, API_URL: "https://example.supabase.co" }, env));
  assert.equal(assertDemoEnvironment("http://localhost:3001", local, env), "http://localhost:3001");
});
