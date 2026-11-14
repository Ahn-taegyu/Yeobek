import type { loadHome, loadProfile } from "@/components/artist/navigation-data";

const updatedAt = "2026-11-15T00:00:00+09:00";
const artistId = "00000000-0000-4000-8000-000000000001";
const document = {
  revision: 1,
  sections: [],
  sourceRefs: [],
  sourceWarnings: [],
  updatedAt,
};

export const mockProfile = {
  id: artistId,
  revision: 1,
  createdAt: updatedAt,
  updatedAt,
  accountEmail: "artist@example.invalid",
  fullName: "김서윤",
  displayName: "김서윤",
  onboardingComplete: true,
  keywords: { fields: ["동양화", "조각", "일러스트", "공예"], moods: ["따뜻한", "서정적인", "실험적인", "유쾌한"], topics: ["자연", "관계", "정체성", "시간"] },
  document: {
    ...document,
    id: "00000000-0000-4000-8000-000000000002",
    subjectId: artistId,
    subjectType: "artist",
    sections: [],
  },
} satisfies Awaited<ReturnType<typeof loadProfile>>;

export const mockHome = {
  profile: mockProfile,
  items: ([
    { title: "여름을 닮은 우리", dashboardStatus: "ongoing", startDate: "2026-11-12", endDate: "2026-11-28" },
    { title: "오늘의 정원", dashboardStatus: "ended", startDate: "2025-10-03", endDate: "2025-10-26" },
    { title: "기억의 조각", dashboardStatus: "preparing", startDate: null, endDate: null },
  ] as const).map(({ title, dashboardStatus, startDate, endDate }, index) => {
    const id = `00000000-0000-4000-8000-00000000001${index}`;
    return {
      id, artistId, title, dashboardStatus, startDate, endDate, place: null, artworkCount: 4,
      state: dashboardStatus === "preparing" ? "draft" as const : "published" as const,
      revision: 1, createdAt: updatedAt, updatedAt,
      document: {
        ...document,
        id: `00000000-0000-4000-8000-00000000002${index}`,
        subjectId: id,
        subjectType: "exhibition" as const,
      },
    };
  }),
} satisfies Awaited<ReturnType<typeof loadHome>>;

export const mockPosters = Object.fromEntries(mockHome.items.map(({ id }, index) =>
  [id, `/yeobek/artist-confirmed/poster-${index + 1}.png`]));
