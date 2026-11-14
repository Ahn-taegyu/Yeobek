import { redirect } from "next/navigation";
import { InterviewHub } from "@/components/artist/flow";
import { getFeatures } from "@/lib/features";

export default async function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getFeatures().artworkInterview) redirect(`/artist/exhibitions/${id}/verification`);
  return <InterviewHub id={id} />;
}
