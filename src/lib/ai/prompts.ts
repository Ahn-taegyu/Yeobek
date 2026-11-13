import { PLUGIN_VERSION, playbookPrompt } from "./plugin";

export const PROMPT_VERSION = PLUGIN_VERSION;
export const DOCENT_SYSTEM_PROMPT = playbookPrompt("visitor-answer");
export const NARRATION_SYSTEM_PROMPT = playbookPrompt("narration-draft");
