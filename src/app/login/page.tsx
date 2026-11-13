import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return <section className="panel narrow">
    <p className="eyebrow">ARTIST</p>
    <h1>작가 로그인</h1>
    <p>발급받은 계정으로 전시 준비를 이어가세요.</p>
    <LoginForm />
  </section>;
}
