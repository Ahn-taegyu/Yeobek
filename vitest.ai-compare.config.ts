import { defineConfig } from "vitest/config";
// Invoked only by the comparison CLI. Never included in normal tests/CI.
export default defineConfig({ test: {
  include: ["tests/evaluation/narration-compare.test.ts"], environment: "node", testTimeout: 6_100_000,
} });
