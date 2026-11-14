import { defineConfig } from "vitest/config";
// Explicit CLI only. Regular CI discovers unit tests, never these API experiments.
export default defineConfig({ test: {
  include: ["tests/evaluation/bivia-compare.test.ts"], environment: "node", testTimeout: 3_600_000,
} });
