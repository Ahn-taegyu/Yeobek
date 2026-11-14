import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import "./theme.css";

export const metadata: Metadata = { title: "여백", description: "작품의 이야기를 이어가는 AI 도슨트" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>
    <header><Link href="/" className="brand">여백<span>Yeobek</span></Link></header>
    <main>{children}</main>
  </body></html>;
}
