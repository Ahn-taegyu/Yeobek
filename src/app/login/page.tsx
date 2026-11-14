import { LoginForm } from "@/components/login-form";
import { AiStarLogo } from "@/components/ui/ai-star/ai-star-logo";
import styles from "./login.module.css";

export default function LoginPage() {
  return <section className={`${styles.screen} ${styles.login} yeobek-appear`}>
    <div className={styles.loginMark}>
      <AiStarLogo state="idle" size={160} label="" />
    </div>
    <h1>안녕하세요, AI 도슨트 여운이에요</h1>
    <p>작가의 이야기가 관람객의 마음에<br />오랫동안 여운으로 남을 수 있도록 도와드릴게요</p>
    <LoginForm />
  </section>;
}
