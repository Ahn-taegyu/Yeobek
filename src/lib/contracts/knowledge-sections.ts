const optionalText = { required: false, maxLength: 5000 } as const;

export const sectionDefinitions = {
  artist: [
    { id: "bio", label: "작가 소개", prompt: "작가를 소개해 주세요.", group: "legacy", ...optionalText },
    { id: "practice", label: "기본 작품 세계", prompt: "기본 작품 세계를 설명해 주세요.", group: "legacy", ...optionalText },
    { id: "artist_motivation", label: "작업 계기", prompt: "작품 활동을 시작하게 된 계기는 무엇인가요?", group: "artist", ...optionalText },
    { id: "artist_interests", label: "핵심 관심사", prompt: "작품 활동을 통해 지속적으로 탐구하는 주제나 관심사는 무엇인가요?", group: "artist", ...optionalText },
    { id: "artist_philosophy", label: "예술관 및 철학", prompt: "작품을 만들 때 가장 중요하게 생각하는 가치나 철학은 무엇인가요?", group: "artist", ...optionalText },
    { id: "artist_methods", label: "표현 방식", prompt: "주로 사용하는 재료, 기법 또는 표현 방식은 무엇인가요?", group: "artist", ...optionalText },
    { id: "artist_method_reason", label: "표현 방식", prompt: "위 표현 방식을 선택한 이유는 무엇인가요?", group: "artist", ...optionalText },
    { id: "artist_inspiration", label: "영감의 원천", prompt: "작품의 아이디어나 영감은 주로 어디에서 얻으시나요?", group: "artist", ...optionalText },
    { id: "artist_audience", label: "소통", prompt: "관람객이 작가의 작품을 통해 어떤 경험을 하거나 질문을 떠올리기를 바라시나요?", group: "artist", ...optionalText },
    { id: "artist_education", label: "학력 및 전공", prompt: "학력 및 전공", group: "artist_history", ...optionalText },
    { id: "artist_exhibitions", label: "주요 전시 경력", prompt: "주요 전시 경력", group: "artist_history", ...optionalText },
    { id: "artist_awards", label: "수상 및 선정 이력", prompt: "수상 및 선정 이력", group: "artist_history", ...optionalText },
    { id: "artist_activities", label: "작품 활동", prompt: "작품 활동", group: "artist_history", ...optionalText },
    { id: "artist_other_history", label: "기타", prompt: "추가로 소개하고 싶은 활동을 입력해 주세요", group: "artist_history", ...optionalText },
  ],
  exhibition: [
    { id: "introduction", label: "전시 소개", prompt: "전시를 소개해 주세요.", group: "legacy", ...optionalText },
    { id: "theme", label: "전시 주제", prompt: "전시 주제를 설명해 주세요.", group: "legacy", ...optionalText },
    { id: "exhibition_background", label: "전시 기획 배경", prompt: "이번 전시를 기획하게 된 계기나 배경은 무엇인가요?", group: "exhibition_basic", ...optionalText },
    { id: "exhibition_layout", label: "전시 구성", prompt: "전시 공간이나 작품의 배치에 특별한 의도가 있나요?", group: "exhibition_basic", ...optionalText },
    { id: "exhibition_guidance", label: "관람 안내", prompt: "관람객이 알아야 할 특별한 안내 사항이 있나요?", group: "exhibition_basic", ...optionalText },
    { id: "exhibition_focus", label: "핵심주제", prompt: "이번 전시에서 특별히 집중하거나 탐구하는 주제는 무엇인가요?", group: "exhibition_world", ...optionalText },
    { id: "exhibition_connection", label: "기존 작품세계와의 연결", prompt: "이번 전시는 작가님의 기존 작품세계와 어떤 관계가 있나요?", group: "exhibition_world", ...optionalText },
    { id: "exhibition_message", label: "전달 메시지", prompt: "이번 전시를 통해 관람객에게 가장 전달하고 싶은 메시지는 무엇인가요?", group: "exhibition_world", ...optionalText },
    { id: "exhibition_distinction", label: "전시의 차별점", prompt: "이전 작업이나 전시와 비교했을 때 이번 전시만의 특징은 무엇인가요?", group: "exhibition_world", ...optionalText },
    { id: "exhibition_viewpoint", label: "감상 관점", prompt: "관람객이 이번 전시를 감상할 때 특별히 주목했으면 하는 부분이 있나요?", group: "exhibition_world", ...optionalText },
    { id: "exhibition_experience", label: "감정 및 경험", prompt: "관람객이 전시를 관람하면서 어떤 경험을 하기를 바라시나요?", group: "exhibition_world", ...optionalText },
  ],
  artwork: [
    { id: "description", label: "작품 소개", prompt: "이 작품을 소개해 주세요.", group: "legacy", ...optionalText },
    { id: "notes", label: "작품 메모", prompt: "작품에 관한 메모를 입력해 주세요.", group: "legacy", ...optionalText },
    { id: "artwork_motivation", label: "제작 계기", prompt: "이 작품을 제작하게 된 계기나 영감은 무엇인가요?", group: "artwork_story", ...optionalText },
    { id: "artwork_meaning", label: "작품의 의미", prompt: "이 작품을 통해 표현하거나 탐구하고자 한 것은 무엇인가요?", group: "artwork_story", ...optionalText },
    { id: "artwork_elements", label: "표현 요소", prompt: "색채, 형태, 소재, 구도 등에서 특별한 의미를 담은 요소가 있나요?", group: "artwork_story", ...optionalText },
    { id: "artwork_process", label: "제작 과정", prompt: "작품을 제작하면서 특별히 기억에 남는 과정이나 어려움이 있었나요?", group: "artwork_story", ...optionalText },
    { id: "artwork_viewpoint", label: "감상 포인트", prompt: "관람객이 이 작품을 감상할 때 주목했으면 하는 부분은 무엇인가요?", group: "artwork_story", ...optionalText },
    { id: "artwork_connection", label: "전시와의 연결", prompt: "이 작품은 이번 전시의 전체 주제와 어떻게 연결되나요?", group: "artwork_story", ...optionalText },
  ],
} as const;

export function sectionsFor<Subject extends keyof typeof sectionDefinitions>(subject: Subject) {
  return sectionDefinitions[subject];
}

const allSections = [...sectionDefinitions.artist, ...sectionDefinitions.exhibition, ...sectionDefinitions.artwork] as const;
type SectionIds<Definitions extends readonly { id: string }[]> = {
  [Index in keyof Definitions]: Definitions[Index]["id"];
};

export const SECTION_IDS = allSections.map(section => section.id) as unknown as SectionIds<typeof allSections>;
export const MAX_SECTIONS = Math.max(...Object.values(sectionDefinitions).map(sections => sections.length));
export const sectionById = new Map(allSections.map(section => [section.id, section] as const));

// Authenticated authoring only: accommodates all sections and escaped Unicode.
export const AUTHORING_JSON_BYTES = 1024 * 1024;
