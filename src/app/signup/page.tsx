import Link from "next/link";
import { SignupForm } from "@/components/signup-form";

export default function SignupPage() {
  return <section className="panel narrow">
    <h1>이메일로 가입하기</h1>
    <SignupForm />
    <p><Link href="/login">로그인으로 돌아가기</Link></p>
  </section>;
}
