import Image from "next/image";
import { brand } from "@/components/ui/brand";
import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import styles from "./login.module.css";

export default function LoginPage() {
  return <section className={`${styles.screen} yeobek-appear`}>
    <Image src={brand.mark} width={120} height={136} alt="" priority />
    <h1>안녕하세요, 저는 AI 도슨트 여운이에요</h1>
    <p>작가의 이야기가 관람객의 마음에<br />오래도록 여운으로 남을 수 있도록 도와드릴게요</p>
    <LoginForm />
    <Link href="/signup">회원가입</Link>
  </section>;
}
