import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createOpenAiSpeechProvider, createOpenAiTextProvider, createOpenAiTranscriptionProvider } from "../../src/lib/ai/providers/openai";
import { createTypecastSpeechProvider } from "../../src/lib/ai/providers/typecast";
import { createLinerTextProvider } from "../../src/lib/ai/providers/liner";
import { AiError } from "../../src/lib/ai/errors";
import { validateAnswer } from "../../src/lib/ai/harness";
import { answerJsonSchema } from "../../src/lib/ai/contracts";
import { DOCENT_SYSTEM_PROMPT, NARRATION_SYSTEM_PROMPT } from "../../src/lib/ai/prompts";
import { ids, syntheticPublication } from "../fixtures/ai";

it("explicit live capability smoke (not answer quality or listening evaluation)", async () => {
  const task = process.env.AI_SMOKE_TASK;
  try {
    if (task === "qa" || task === "draft") {
      const provider = task === "qa" ? createOpenAiTextProvider() : createLinerTextProvider();
      const result = await provider.generate({ system: task === "qa" ? DOCENT_SYSTEM_PROMPT : NARRATION_SYSTEM_PROMPT,
        input: JSON.stringify({ question: task === "qa" ? "작품에 사용한 재료를 알려주세요." : "이 작품의 기본 해설 후보를 작성해주세요.",
          evidence: syntheticPublication().evidence.map(({ id, version, sourceLabel, body }) => ({ id, version, sourceLabel, body })) }), schema: answerJsonSchema });
      if (validateAnswer(result.output, [ids.evidence]).outcome !== "answered") throw new Error("no usable answer");
    } else if (task === "stt") {
      const path = process.env.AI_SMOKE_AUDIO;
      if (!path) throw new Error("invalid recording");
      const file = await stat(path);
      if (!file.isFile() || file.size > 3 * 1024 * 1024) throw new Error("invalid recording");
      const bytes = await readFile(path);
      await createOpenAiTranscriptionProvider().transcribe({ audio: new Blob([bytes]), filename: basename(path), language: "ko" });
    } else if (task === "typecast-tts" || task === "openai-tts") {
      const provider = task === "typecast-tts" ? createTypecastSpeechProvider() : createOpenAiSpeechProvider();
      await provider.synthesize({ text: "합성 시험 안내입니다. 십팔 번 작품의 오른쪽 위에 파란 달이 있습니다." });
    } else { throw new Error("explicit task required"); }
  } catch (error) {
    // Keep provider bodies, keys and local recording paths out of test reports.
    throw new Error(error instanceof AiError ? `AI smoke failed: ${error.code}` : "AI smoke failed: local input or output validation");
  }
});
