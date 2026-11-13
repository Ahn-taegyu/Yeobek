import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { localStatus } from "./local-supabase.mjs";

localStatus(); // Refuse a remote or differently named stack.
const types = execFileSync(process.execPath, [resolve("node_modules/supabase/dist/supabase.js"), "gen", "types", "--local", "--lang", "typescript"], {
  encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], timeout: 30_000,
});
if (!types.includes("export type Database")) throw new Error("CLI did not return database types.");
const normalized = types.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trimEnd() + "\n";
writeFileSync("src/lib/supabase/database.types.ts", normalized, "utf8");
console.log("Updated database.types.ts from the local schema.");
