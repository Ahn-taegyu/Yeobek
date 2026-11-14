import { redirect } from "next/navigation";
import { ExhibitionInterviewChat } from "@/components/artist/exhibition-interview";
import { getFeatures } from "@/lib/features";

export default async function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const features = getFeatures();
  if (!features.artworkInterview) redirect(`/artist/exhibitions/${id}/verification`);
  // Voice answers reuse the author preview transcription route, which needs both preview flags.
  return <ExhibitionInterviewChat id={id} voice={features.previewExperience && features.previewChat} />;
}
