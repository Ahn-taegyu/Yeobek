import { defineConfig } from "vitest/config";
// Never discovered by normal CI. Live modes require an explicit CLI and free-account allowance.
export default defineConfig({ test: {
  include: ["tests/evaluation/bivia-recompare.test.ts"], environment: "node", testTimeout: 3_600_000,
} });
