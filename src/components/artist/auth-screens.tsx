import Image from "next/image";
import { AiStarLogo } from "@/components/ui/ai-star/ai-star-logo";
import Link from "next/link";
import { SignupForm } from "@/components/signup-form";
import { LoginForm } from "@/components/login-form";
import styles from "@/app/login/login.module.css";

export function LoginScreen({ preview = false }: { preview?: boolean }) {
  return <section className={`${styles.screen} ${styles.login} yeobek-appear`}>
    <div className={styles.loginMark}>
      {preview ? <Image src="/yeobek/artist-confirmed/login-mark.svg" width={219} height={198} alt="" priority /> :
        <AiStarLogo state="idle" size={160} label="" />}
    </div>
    <h1>안녕하세요, AI 도슨트 여운이에요</h1>
    <p>작가의 이야기가 관람객의 마음에<br />오랫동안 여운으로 남을 수 있도록 도와드릴게요</p>
    <LoginForm preview={preview} />
  </section>;
}
export function SignupScreen({ preview = false }: { preview?: boolean }) {
  return <section className={`${styles.screen} ${styles.signup} yeobek-appear`}>
    <div className={styles.signupHeading}>
      <Link href={preview ? "/dev/artist-preview/login" : "/login"} aria-label="로그인으로 돌아가기">
        <Image src="/yeobek/artist-confirmed/back.svg" width={28} height={28} alt="" loading="eager" />
      </Link>
      <h1>기본 정보</h1>
    </div>
    <SignupForm preview={preview} />
  </section>;
}