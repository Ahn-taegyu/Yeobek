import { PLUGIN_VERSION, playbookPrompt } from "./plugin";
import { yeobekPlugin } from "./plugin.generated";

export const PROMPT_VERSION = PLUGIN_VERSION;
export const DOCENT_SYSTEM_PROMPT = playbookPrompt("visitor-answer");
export const DOCENT_EVIDENCE_REVIEW_PROMPT = [DOCENT_SYSTEM_PROMPT, yeobekPlugin.skills["review-visitor-evidence"].instructions].join("\n\n");
export const NARRATION_SYSTEM_PROMPT = playbookPrompt("narration-draft");
