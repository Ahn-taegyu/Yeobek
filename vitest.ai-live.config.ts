import { defineConfig } from "vitest/config";
// Deliberately separate from the normal unit suite and CI: one explicit task.
export default defineConfig({ test: { include: ["tests/live/ai-smoke.test.ts"], environment: "node", testTimeout: 35000 } });
