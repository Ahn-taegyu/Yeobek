import "server-only";
import { MAX_RECORDING_BYTES } from "../ai/providers/recording";
import { transcribeRequest } from "../contracts/voice";
import { ApiError } from "./errors";

const maxBodyBytes = MAX_RECORDING_BYTES + 16 * 1024;
const invalid = () => new ApiError(400, "INVALID_INPUT", "녹음 파일과 요청 내용을 확인해 주세요.");
const tooLarge = () => new ApiError(413, "TOO_LARGE", "녹음 파일은 3 MiB까지 올릴 수 있습니다.");
const formats = {
  wav: { mime: "audio/wav", suffix: "wav" },
  webm: { mime: "audio/webm", suffix: "webm" },
  // MediaRecorder labels audio-only MP4 as .mp4; Liner accepts that container as .m4a.
  mp4: { mime: "audio/mp4", suffix: "m4a" },
  m4a: { mime: "audio/mp4", suffix: "m4a" },
  mpeg: { mime: "audio/mpeg", suffix: "mp3" },
  mpga: { mime: "audio/mpeg", suffix: "mp3" },
  mp3: { mime: "audio/mpeg", suffix: "mp3" },
  ogg: { mime: "audio/ogg", suffix: "ogg" },
} as const;

function hasHeader(bytes: Uint8Array, mime: string) {
  const signature = (offset: number, text: string) =>
    bytes.length >= offset + text.length && Array.from(text).every((char, index) => bytes[offset + index] === char.charCodeAt(0));
  switch (mime) {
    case "audio/wav": return signature(0, "RIFF") && signature(8, "WAVE");
    case "audio/webm": return bytes.length > 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
    case "audio/mp4": return bytes.length >= 16 && signature(4, "ftyp");
    case "audio/mpeg": return (bytes.length >= 10 && signature(0, "ID3")) ||
      (bytes.length >= 4 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 0x06) !== 0);
    case "audio/ogg": return bytes.length >= 27 && signature(0, "OggS") && bytes[4] === 0;
    default: return false;
  }
}

export async function readTranscription(request: Request) {
  const checkActive = () => {
    if (request.signal.aborted) throw new ApiError(499, "REQUEST_CANCELLED", "녹음 요청이 취소되었습니다.");
  };
  checkActive();
  const contentType = request.headers.get("content-type");
  if (contentType?.split(";")[0].trim().toLowerCase() !== "multipart/form-data") {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "녹음 파일은 multipart/form-data 형식으로 보내 주세요.");
  }
  if (Number(request.headers.get("content-length")) > maxBodyBytes) throw tooLarge();
  const reader = request.body?.getReader();
  if (!reader) throw invalid();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  request.signal.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      checkActive();
      const { value, done } = await reader.read();
      checkActive();
      if (done) break;
      size += value.byteLength;
      if (size > maxBodyBytes) { cancel(); throw tooLarge(); }
      chunks.push(new Uint8Array(value));
    }
  } catch (error) {
    checkActive();
    if (error instanceof ApiError) throw error;
    throw invalid();
  } finally {
    request.signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
  let form: FormData;
  try {
    form = await new Response(new Blob(chunks), { headers: { "Content-Type": contentType } }).formData();
  } catch { throw invalid(); }
  checkActive();
  const fields = new Map<string, FormDataEntryValue>();
  for (const [key, value] of form) {
    if (fields.has(key)) throw invalid();
    fields.set(key, value);
  }
  const raw = Object.fromEntries(fields);
  if (raw.file instanceof File && raw.file.size > MAX_RECORDING_BYTES) throw tooLarge();
  const parsed = transcribeRequest.parse(raw);
  const extension = /\.([a-z0-9]{3,4})$/i.exec(parsed.file.name)?.[1].toLowerCase();
  const format = extension && Object.hasOwn(formats, extension) ? formats[extension as keyof typeof formats] : undefined;
  // Browsers may append the codec parameter to MediaRecorder's MIME.
  const declaredMime = parsed.file.type.split(";")[0].trim().toLowerCase();
  if (!format || declaredMime !== format.mime ||
    !hasHeader(new Uint8Array(await parsed.file.slice(0, 32).arrayBuffer()), format.mime)) throw invalid();
  checkActive();
  const filename = `recording.${format.suffix}`;
  return { ...parsed, file: new File([parsed.file], filename, { type: format.mime }), filename };
}
