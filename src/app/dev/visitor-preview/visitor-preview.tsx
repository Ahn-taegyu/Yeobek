"use client";

import Image from "next/image";
import { ExhibitionExperience } from "@/components/visitor/visitor-exhibition";
import type {
  ExperienceExhibition, ExperienceImageProps, ExperienceTransport,
} from "@/components/visitor/experience-types";

const works = [
  { title: "여름의 풍경", description: "푸른 하늘 아래 걷던 여름날의 기억을 담았습니다." },
  { title: "정원의 오후", description: "빛이 드는 정원에서 보낸 느린 오후를 그렸습니다." },
  { title: "물가의 쉼", description: "물가에 머무는 사람들과 나무의 움직임을 담았습니다." },
  { title: "함께하는 시간", description: "서로의 마음을 살피며 함께하는 장면입니다." },
  { title: "창가의 하루", description: "창문 너머의 풍경과 일상적인 순간을 바라봅니다." },
  { title: "빛의 흔적", description: "변하는 빛과 색의 결을 따라가며 만든 작품입니다." },
].map((work, index) => ({
  ...work,
  id: `preview-work-${index + 1}`,
  number: index + 1,
  image: index === 3 || index === 4 ? null : { id: String(index + 1) },
}));

const exhibition: ExperienceExhibition = {
  id: "local-visitor-preview",
  title: "여름을 닮은 우리",
  artistDisplayName: "시연 작가",
  place: "시연 전시 공간",
  startDate: "2026-07-17",
  endDate: "2026-11-29",
  introduction: "여섯 작품으로 일상의 기억과 풍경을 살펴보는 로컬 시연 전시입니다.",
  poster: { id: "1" },
  artworks: works,
};

function PreviewImage({ id, alt, className, kind }: ExperienceImageProps) {
  const index = Number(id);
  if (!Number.isInteger(index) || index < 1 || index > works.length) return null;
  const imageName = kind === "poster" || index > 3 ? `work-${index}` : `sample-${index}`;
  return <Image unoptimized src={`/yeobek/preview/${imageName}.png`} alt={alt}
    className={className} width={kind === "poster" ? 233 : 352} height={kind === "poster" ? 392 : 352} />;
}

const previewTransport: ExperienceTransport = {
  async ask(body) {
    const selected = works.find(work => work.id === body.artworkId);
    return {
      answerId: crypto.randomUUID(),
      answer: selected && body.intent === "narration"
        ? `[시연 기본 해설] ${selected.description}`
        : selected
        ? `[시연 답변] ${selected.title} — ${selected.description} 작가명은 시연 작가입니다.`
        : "[시연 답변] 이 전시는 일상의 풍경과 기억을 다룹니다. 작품을 선택해 질문할 수도 있어요.",
      artworkId: selected?.id ?? null,
      contextSequence: body.contextSequence,
      outputMode: "text",
      image: selected?.image,
      canSpeak: false,
    };
  },
  async transcribe() {
    throw new Error("로컬 시연에서는 음성 인식을 사용할 수 없어요.");
  },
  async speak() {
    throw new Error("로컬 시연에서는 음성 재생을 사용할 수 없어요.");
  },
};

export function VisitorPreview() {
  return <ExhibitionExperience exhibition={exhibition} transport={previewTransport}
    ImageComponent={PreviewImage} initiallyMuted />;
}
