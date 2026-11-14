import { AuthorPreviewExperience } from "@/components/artist/author-preview-experience";
import { getFeatures } from "@/lib/features";
import { Preview } from "@/components/artist/review";

export default async function PreviewPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ work?: string; qa?: string }>;
}) {
  const [{ id }, { work, qa }] = await Promise.all([params, searchParams]);
  const features = getFeatures();
  if (features.previewExperience && features.previewChat && !qa) {
    return <AuthorPreviewExperience key={`${id}:${work ?? ""}`} id={id} initialArtworkId={work} />;
  }
  return <Preview id={id} initialArtworkId={work} qaId={qa} />;
}
