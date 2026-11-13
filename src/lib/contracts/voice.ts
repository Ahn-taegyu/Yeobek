import { z } from "zod";
import { MAX_RECORDING_BYTES } from "../ai/providers/recording";
import { boundedText } from "./chat";

const id = z.uuid().toLowerCase();

export const transcribeRequest = z.strictObject({
  requestId: id,
  exhibitionId: id,
  file: z.file().min(1).max(MAX_RECORDING_BYTES),
});

export const transcriptionResult = z.strictObject({
  requestId: id,
  transcript: boundedText(4000),
  mock: z.boolean(),
});
export const transcribeResponse = transcriptionResult.extend({ overLimit: z.boolean() });

export const speechRequest = z.strictObject({ requestId: id, answerId: id });

// Internal ledger envelope; never expose storage keys through a JSON HTTP response.
export const voiceReservation = z.strictObject({
  id, claimed: z.boolean(), status: z.enum(["running", "succeeded", "failed"]),
  result: z.record(z.string(), z.unknown()).nullable(), mock: z.boolean(),
  expiresAt: z.iso.datetime({ offset: true }), failureCode: z.string().nullable(),
});
