import { VisitorExhibition } from "@/components/visitor/visitor-exhibition";

export default async function ArtworkPage({ params }: {
  params: Promise<{ exhibitionId: string; artworkId: string }>;
}) {
  const { exhibitionId, artworkId } = await params;
  return <VisitorExhibition key={artworkId} exhibitionId={exhibitionId} initialArtworkId={artworkId} />;
}
