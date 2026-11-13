import { AiError } from "../errors";

export const RECORDING_CONTENT_TYPES: Record<string, string> = {
  flac: "audio/flac",
  mp3: "audio/mpeg",
  mp4: "audio/mp4",
  mpeg: "audio/mpeg",
  mpga: "audio/mpeg",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  wav: "audio/wav",
  webm: "audio/webm",
};
export const MAX_RECORDING_BYTES = 3 * 1024 * 1024;

export function recordingExtension(audio: Blob, filename: string, language?: string) {
  const extension = typeof filename === "string" ? /\.([a-z0-9]{3,4})$/i.exec(filename)?.[1].toLowerCase() : undefined;
  if (!(audio instanceof Blob) || audio.size === 0 || audio.size > MAX_RECORDING_BYTES ||
      !extension || !Object.hasOwn(RECORDING_CONTENT_TYPES, extension) ||
      (language !== undefined && !/^[a-z]{2}$/.test(language))) {
    throw new AiError("invalid_input");
  }
  return extension;
}
