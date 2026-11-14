import { notFound } from "next/navigation";
import { VisitorPreview } from "./visitor-preview";

export const dynamic = "force-dynamic";

export default function VisitorPreviewPage() {
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL) notFound();
  return <VisitorPreview />;
}
