import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export function loadAiEnv() {
  // Shell values win, followed by .env.local and .env. Never print values.
  for (const filename of [".env.local", ".env"]) {
    try {
      const values = parseEnv(readFileSync(new URL(`../${filename}`, import.meta.url), "utf8"));
      for (const [key, value] of Object.entries(values)) if (process.env[key] === undefined) process.env[key] = value;
    } catch (error) {
      if (error.code !== "ENOENT") throw new Error("AI environment file could not be read.");
    }
  }
}
export const requiredKeys = {
  qa: ["OPENAI_API_KEY"], draft: ["LINER_API_KEY"], stt: ["OPENAI_API_KEY"],
  "typecast-tts": ["TYPECAST_API_KEY", "TYPECAST_VOICE_ID"], "openai-tts": ["OPENAI_API_KEY"],
};
