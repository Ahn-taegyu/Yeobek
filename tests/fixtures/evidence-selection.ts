import type { Evidence } from "../../src/lib/ai/contracts";
import { hash, ids } from "./ai";

// Entirely fictional excerpts. More rows than AI_LIMITS.evidenceCount so selection must drop some.
const rows: Array<[string, Evidence["scope"], string]> = [
  ["E01", "artwork", "이 작품은 가상의 작가가 겨울 바닷가 등대를 그린 유화입니다. 캔버스 크기는 가로 91센티미터, 세로 73센티미터입니다."],
  ["E02", "artwork", "작가는 등대를 직접 보며 그리지 않았습니다. 여름에 찍어 둔 사진과 기억을 바탕으로 작업실에서 완성했다고 말했습니다."],
  ["E03", "artwork", "화면 왼쪽 아래의 작은 배는 처음 스케치에는 없었습니다. 작가는 마지막 주에 배를 덧그려 바다의 거리감을 만들었다고 설명했습니다."],
  ["E04", "artwork", "하늘의 회색은 흰색과 군청색을 섞어 만들었고 검은색 물감은 쓰지 않았습니다."],
  ["E05", "artwork", "등대 불빛의 노란 점은 팔레트 나이프로 두껍게 올렸습니다. 가까이에서 보면 물감이 튀어나와 있습니다."],
  ["E06", "artwork", "작가는 등대를 '혼자 남아도 자리를 지키는 사람'에 비유했습니다. 아버지가 오래 일했던 항구를 떠올리며 이 소재를 골랐다고 밝혔습니다."],
  ["E07", "artwork", "작품 제목은 처음에 '북쪽 항구'였으나 전시 직전 '등대의 겨울'로 바뀌었습니다. 제목을 바꾼 이유는 공개 자료에 기록되어 있지 않습니다."],
  ["E08", "artwork", "바닷물결은 가로 방향의 짧은 붓질을 반복해 표현했습니다. 작가는 파도 소리를 붓의 리듬으로 옮기고 싶었다고 말했습니다."],
  ["E09", "artwork", "이 작품은 2024년 겨울부터 2025년 봄까지 약 넉 달 동안 그렸습니다."],
  ["E10", "artwork", "보존 기록: 2025년 액자 교체 때 캔버스 오른쪽 가장자리의 작은 들뜸을 보수했습니다."],
  ["E11", "artwork", "등대 아래 바위의 붉은 기운은 해 질 녘 빛을 나타냅니다. 작가는 겨울 햇빛이 짧게 비치는 순간을 붙잡고 싶었다고 했습니다."],
  ["E12", "artwork", "작품 속 눈은 실제로 내린 눈이 아니라 작가가 상상으로 더한 것입니다. 사진을 찍은 날에는 눈이 없었습니다."],
  ["E13", "artwork", "액자는 작가가 직접 고른 짙은 갈색 원목입니다."],
  ["E14", "artwork", "화면 위쪽 구름은 마르기 전의 물감을 천으로 닦아 내 밝은 부분을 만들었습니다."],
  ["E15", "exhibition", "이번 전시는 바다와 항구를 주제로 한 연작 여섯 점을 소개합니다."],
  ["E16", "exhibition", "전시장 조명은 작품 보호를 위해 낮게 유지하며 사진 촬영은 플래시 없이 가능합니다."],
  ["E17", "exhibition", "연작의 다른 작품들은 여름 항구를 밝은 색으로 그렸고, 이 작품만 겨울을 다룹니다."],
  ["E18", "exhibition", "관람객은 작품 옆 번호를 입력해 해설을 들을 수 있습니다."],
  ["E19", "artist", "작가는 미술대학에서 판화를 전공했고 졸업 후 유화로 재료를 바꾸었습니다."],
  ["E20", "artist", "작가는 작업할 때 음악을 듣지 않고 창문을 열어 바깥 소리를 듣는다고 말했습니다."],
  ["E21", "artist", "작가는 작품마다 같은 군청색 물감을 쓰며 이 색을 '바다의 기본색'이라고 부릅니다."],
  ["E22", "artist", "작가는 어린 시절 항구 마을에서 자랐고 열두 살 때 도시로 이사했습니다."],
];

export const selectionEvidence: Evidence[] = rows.map(([key, scope, body], index) => ({
  id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, version: 1,
  ownerId: ids.owner, exhibitionId: ids.exhibition, publicationId: ids.publication,
  artworkId: scope === "artwork" ? ids.artwork : null, scope, sourceLabel: `가상 자료 ${key}`, body, contentHash: hash(body),
}));
export const evidenceId = (key: string) => selectionEvidence[Number(key.slice(1)) - 1].id;

/** Visitor wording intentionally differs from the excerpt (particles, endings). Not measured against real visitors. */
export const selectionCases: Array<{ question: string; expected: string }> = [
  { question: "배는 처음부터 그려져 있었나요?", expected: "E03" },
  { question: "등대 불빛은 어떻게 칠했어요?", expected: "E05" },
  { question: "눈 내린 날 보고 그린 건가요?", expected: "E12" },
  { question: "검은색도 썼나요?", expected: "E04" },
  { question: "작가는 어디서 자랐나요?", expected: "E22" },
  { question: "등대에 아버지 이야기가 담겨 있나요?", expected: "E06" },
  { question: "얼마 동안 그린 작품이에요?", expected: "E09" },
  { question: "작업하면서 음악 들으세요?", expected: "E20" },
  { question: "제목은 왜 바뀌었어요?", expected: "E07" },
  { question: "바위가 붉은 이유는요?", expected: "E11" },
  { question: "이 작품만 겨울 풍경인가요?", expected: "E17" },
  { question: "액자는 누가 골랐나요?", expected: "E13" },
  { question: "판화도 하셨던 분인가요?", expected: "E19" },
  { question: "구름의 밝은 부분은 어떻게 만들었나요?", expected: "E14" },
  { question: "사진 찍어도 되나요?", expected: "E16" },
  { question: "연작은 몇 점이에요?", expected: "E15" },
];
