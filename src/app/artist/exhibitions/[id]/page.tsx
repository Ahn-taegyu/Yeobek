import { ExhibitionEditor } from "@/components/artist/exhibition-editor";
import { getFeatures } from "@/lib/features";

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExhibitionEditor key={id} id={id === "new" ? undefined : id} interviewEnabled={getFeatures().artworkInterview} />;
}
