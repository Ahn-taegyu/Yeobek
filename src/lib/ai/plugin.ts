import "server-only";
import { yeobekPlugin } from "./plugin.generated";

export type PlaybookId = keyof typeof yeobekPlugin.playbooks;
export type PluginTool = typeof yeobekPlugin.playbooks[PlaybookId]["tools"][number];
export const PLUGIN_VERSION = `${yeobekPlugin.id}@${yeobekPlugin.version}:${yeobekPlugin.fingerprint.slice(0, 12)}`;

/** Called only by the server workflow, never selected by an untrusted message. */
export function playbookPrompt(id: PlaybookId): string {
  return [yeobekPlugin.instructions, ...yeobekPlugin.playbooks[id].skills.map(name =>
    yeobekPlugin.skills[name].instructions)].join("\n\n");
}
export function assertPluginTool(id: PlaybookId, tool: PluginTool) {
  const allowed: readonly string[] = yeobekPlugin.playbooks[id].tools;
  if (!allowed.includes(tool)) throw new Error("plugin_tool_not_allowed");
}

export const DOCENT_COPY = yeobekPlugin.messages;
