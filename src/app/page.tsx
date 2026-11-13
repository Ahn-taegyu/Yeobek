import Link from "next/link";

export default function HomePage() {
  return <section className="hero">
    <p className="eyebrow">작품과 이야기 사이</p>
    <h1>작품 곁에,<br />작가의 이야기를.</h1>
    <p>관람객과 이어질 전시의 이야기를 준비하세요.</p>
    <Link className="button" href="/login">작가로 시작하기 <span aria-hidden="true">↗</span></Link>
  </section>;
}
