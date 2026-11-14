import type { ChatRequestInput } from "@/lib/contracts/chat";

export type ExperienceImageProps = { id: string; kind: "image" | "poster"; alt: string; className?: string; fallback?: string };
export type ExperienceArtwork = { id: string; number: number; title: string; image?: { id: string } | null };
export type ExperienceExhibition = {
  id: string; title: string; artistDisplayName: string; place: string | null;
  startDate: string | null; endDate: string | null; startTime?: string | null; endTime?: string | null;
  introduction: string | null; poster?: { id: string } | null; artworks: ExperienceArtwork[];
};
export type ExperienceReply = {
  answerId: string; answer: string; artworkId: string | null; contextSequence: number;
  outputMode: "text" | "voice"; image?: { id: string } | null; notice?: string; canSpeak?: boolean;
};
export type ExperienceTransport = {
  ask(body: ChatRequestInput, signal: AbortSignal): Promise<ExperienceReply>;
  transcribe(body: { requestId: string; exhibitionId: string; file: File }, signal: AbortSignal): Promise<{ transcript: string }>;
  speak(body: { requestId: string; answerId: string }, signal: AbortSignal): Promise<Blob>;
};
