import { loadAiEnv, requiredKeys } from "./ai-env.mjs";
loadAiEnv();
const selection = process.env.AI_TTS_PROVIDER?.trim() || "typecast";
const capabilities = Object.fromEntries(Object.entries(requiredKeys).map(([name, keys]) => {
  const missing = keys.filter(key => !process.env[key]?.trim());
  return [name, { configured: !missing.length, missing }];
}));
const selectionValid = ["typecast", "openai"].includes(selection);
console.log(JSON.stringify({ check: "local-variable-presence-only", networkCalls: 0, accountAccessVerified: false,
  ttsSelectionValid: selectionValid, capabilities,
  integration: "blocked: publication/answer stores, sessions and durable request budgets pending" }, null, 2));
if (!selectionValid || !capabilities.qa.configured || !capabilities.draft.configured || !capabilities.stt.configured ||
    !capabilities[selection === "openai" ? "openai-tts" : "typecast-tts"].configured) process.exitCode = 1;
