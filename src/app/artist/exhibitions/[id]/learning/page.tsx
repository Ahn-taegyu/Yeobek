import { Learning } from "@/components/artist/review";
import { getFeatures } from "@/lib/features";

export default async function LearningPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ next?: string }>;
}) {
  const [{ id }, { next }] = await Promise.all([params, searchParams]);
  const interviewEnabled = getFeatures().artworkInterview;
  return <Learning id={id} interviewEnabled={interviewEnabled} reflect={interviewEnabled && next === "review"} />;
}
