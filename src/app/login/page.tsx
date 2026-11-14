import Image from "next/image";
import { LoginForm } from "@/components/login-form";
import { brand } from "@/components/ui/brand";
import styles from "./login.module.css";

export default function LoginPage() {
  return <section className={`${styles.screen} ${styles.login} yeobek-appear`}>
    <div className={styles.loginMark}>
      <Image src={brand.mark} width={200} height={214} alt="" priority />
    </div>
    <h1>안녕하세요, AI 도슨트 여운이에요</h1>
    <p>작가의 이야기가 관람객의 마음에<br />오랫동안 여운으로 남을 수 있도록 도와드릴게요</p>
    <LoginForm />
  </section>;
}