import { Learning } from "@/components/artist/review";

export default async function LearningPage({ params }: { params: Promise<{ id: string }> }) {
  return <Learning id={(await params).id} />;
}
