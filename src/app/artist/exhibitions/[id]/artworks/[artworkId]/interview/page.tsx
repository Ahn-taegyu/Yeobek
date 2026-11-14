import { notFound, redirect } from "next/navigation";
import { ArtworkInterview } from "@/components/artist/artwork-interview";
import { listInterview } from "@/lib/ai/interview-service";
import { authenticatedDb } from "@/lib/api/db";
import { ApiError } from "@/lib/api/errors";
import { uuid } from "@/lib/contracts/requests";
import { getFeatures } from "@/lib/features";

export default async function InterviewPage({ params }: { params: Promise<{ id: string; artworkId: string }> }) {
  if (!getFeatures().artworkInterview) notFound();
  const { id, artworkId } = await params;
  const exhibition = uuid.safeParse(id);
  const artwork = uuid.safeParse(artworkId);
  if (!exhibition.success || !artwork.success) notFound();
  const interview = await authenticatedDb().then(db => listInterview(db, artwork.data)).catch(error => {
    if (error instanceof ApiError && error.status === 401) redirect("/login");
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
  if (interview.exhibitionId !== exhibition.data) notFound();
  return <ArtworkInterview artworkId={artwork.data} initial={interview} />;
}
