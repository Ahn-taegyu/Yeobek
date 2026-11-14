import { readFileSync, readdirSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { sectionDefinitions } from "../src/lib/contracts/knowledge-sections.ts";

// Print a seed for a NEW migration. Never rewrite already applied migrations.
const seed = "$section_catalog$" + JSON.stringify(sectionDefinitions) + "$section_catalog$";
if (process.argv.includes("--check")) {
  const directory = new URL("../supabase/migrations/", import.meta.url);
  const marked = readdirSync(directory).filter(name => name.endsWith(".sql")).sort().flatMap(name => {
    const sql = readFileSync(new URL(name, directory), "utf8");
    if (!sql.includes("-- section-catalog:start")) return [];
    const match = sql.match(/-- section-catalog:start\s*\$section_catalog\$([\s\S]*?)\$section_catalog\$\s*-- section-catalog:end/);
    if (!match) throw new Error(`Invalid section catalog marker in ${name}`);
    return [{ name, value: JSON.parse(match[1]) }];
  });
  const latest = marked.at(-1);
  if (!latest || !isDeepStrictEqual(latest.value, sectionDefinitions)) {
    throw new Error("Section catalog changed: add a new migration with the output of npm run knowledge:sections.");
  }
  console.log(`Section catalog matches ${latest.name}.`);
} else {
  console.log("-- section-catalog:start\n" + seed + "\n-- section-catalog:end");
}
