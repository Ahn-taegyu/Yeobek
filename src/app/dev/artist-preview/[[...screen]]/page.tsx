import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LoginScreen, SignupScreen } from "@/components/artist/auth-screens";
import { ArtistDashboard } from "@/components/artist-home";
import { ArtistWorldForm, OnboardingSteps } from "@/components/artist/onboarding";
import artistStyles from "@/components/artist/artist-figma.module.css";
import "@/components/artist/artist.css";
import { mockHome, mockPosters, mockProfile } from "../mock-data";
import styles from "../preview.module.css";

const screens = {
  login: "로그인",
  signup: "회원가입 기본 정보",
  history: "활동 이력",
  keywords: "활동 분야·분위기·주제",
  home: "작가 홈",
  world: "나의 작품세계",
} as const;

export default async function ArtistPreview({ params }: { params: Promise<{ screen?: string[] }> }) {
  if (process.env.NODE_ENV !== "development") notFound();

  const { screen = [] } = await params;
  if (screen.length === 0) redirect("/dev/artist-preview/home");
  const [current] = screen;
  if (screen.length !== 1 || !Object.hasOwn(screens, current)) notFound();

  let content;
  switch (current) {
    case "login": content = <LoginScreen preview />; break;
    case "signup": content = <SignupScreen preview />; break;
    case "history": content = <OnboardingSteps key={current} initial={mockProfile} previewStep={2} />; break;
    case "keywords": content = <OnboardingSteps key={current} initial={mockProfile} previewStep={3} />; break;
    case "home": content = <ArtistDashboard data={mockHome} previewPosters={mockPosters} preview />; break;
    case "world": content = <ArtistWorldForm document={mockProfile.document} />; break;
  }

  return <>
    <aside className={styles.panel}>
      <p><strong>개발용 작가 미리보기</strong> · 예시 데이터 · 로그인과 저장 비활성화</p>
      <nav aria-label="작가 미리보기 화면">
        {Object.entries(screens).map(([slug, label]) => <Link key={slug}
          href={`/dev/artist-preview/${slug}`} aria-current={slug === current ? "page" : undefined}>{label}</Link>)}
      </nav>
    </aside>
    {current === "login" || current === "signup" ? content :
      <div className="artist-screen">
        <div className={current === "home" ? artistStyles.homeScreen : artistStyles.formScreen}>{content}</div>
      </div>}
  </>;
}
