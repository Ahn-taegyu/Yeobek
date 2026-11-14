import { Learning } from "@/components/artist/review";
import { getFeatures } from "@/lib/features";

export default async function LearningPage({ params }: { params: Promise<{ id: string }> }) {
  return <Learning id={(await params).id} interviewEnabled={getFeatures().artworkInterview} />;
}
