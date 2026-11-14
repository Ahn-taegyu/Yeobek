import { VerificationHub } from "@/components/artist/flow";
import { getFeatures } from "@/lib/features";

export default async function VerificationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VerificationHub id={id} interviewEnabled={getFeatures().artworkInterview} />;
}
