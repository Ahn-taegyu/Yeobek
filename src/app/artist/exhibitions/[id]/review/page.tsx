import { NarrationReview } from "@/components/artist/narration-review";

export default async function NarrationReviewPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ batch?: string; work?: string }>;
}) {
  const [{ id }, { batch, work }] = await Promise.all([params, searchParams]);
  return <NarrationReview key={`${id}:${batch}:${work}`} id={id} batchId={batch} initialArtworkId={work} />;
}
