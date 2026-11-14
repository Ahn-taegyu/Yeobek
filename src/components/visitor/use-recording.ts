"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_RECORDING_BYTES } from "@/lib/ai/providers/recording";

const formats = [
  { mime: "audio/webm", suffix: "webm" },
  { mime: "audio/mp4", suffix: "m4a" },
  { mime: "audio/ogg", suffix: "ogg" },
];

export function useRecording(onFile: (file: File) => void, onError: (message: string) => void) {
  const [state, setState] = useState<"idle" | "requesting" | "recording">("idle");
  const current = useRef<{ stop: () => void; cancel: () => void } | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => {
    request.current?.abort();
    current.current?.cancel();
  }, []);

  async function start() {
    if (request.current || current.current) return;
    const format = formats.find(({ mime }) => globalThis.MediaRecorder?.isTypeSupported(mime));
    if (!format || !navigator.mediaDevices?.getUserMedia) {
      onError("이 브라우저에서는 음성 녹음을 사용할 수 없어요.");
      return;
    }
    const pending = new AbortController();
    request.current = pending;
    setState("requesting");
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const release = () => stream?.getTracks().forEach(track => track.stop());
      if (pending.signal.aborted) {
        release();
        return;
      }
      const recorder = new MediaRecorder(stream, { mimeType: format.mime });
      const parts: Blob[] = [];
      let bytes = 0;
      let cancelled = false;
      const stop = () => {
        if (recorder.state !== "inactive") recorder.stop();
      };
      const timer = setTimeout(stop, 30_000);
      const cleanup = () => {
        clearTimeout(timer);
        release();
        current.current = null;
      };
      current.current = { stop, cancel: () => { cancelled = true; stop(); cleanup(); } };
      recorder.ondataavailable = ({ data }) => {
        bytes += data.size;
        if (bytes <= MAX_RECORDING_BYTES) parts.push(data);
        else stop();
      };
      recorder.onerror = () => {
        cancelled = true;
        cleanup();
        setState("idle");
        onError("음성을 녹음하지 못했어요. 다시 시도해주세요.");
      };
      recorder.onstop = () => {
        cleanup();
        if (cancelled) return;
        setState("idle");
        if (!bytes || bytes > MAX_RECORDING_BYTES) {
          onError("녹음이 비어 있거나 너무 길어요. 짧게 다시 녹음해주세요.");
          return;
        }
        onFile(new File(parts, `recording.${format.suffix}`, { type: recorder.mimeType }));
      };
      try {
        recorder.start(250);
      } catch (error) {
        cleanup();
        throw error;
      }
      setState("recording");
    } catch {
      stream?.getTracks().forEach(track => track.stop());
      if (!pending.signal.aborted) {
        setState("idle");
        onError("마이크를 사용할 수 없어요. 브라우저 권한을 확인해주세요.");
      }
    } finally {
      if (request.current === pending) request.current = null;
    }
  }

  return { state, start, stop: () => current.current?.stop() };
}
