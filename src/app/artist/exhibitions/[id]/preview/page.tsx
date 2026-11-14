import { Preview } from "@/components/artist/review";

export default async function PreviewPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ work?: string; qa?: string }>;
}) {
  const [{ id }, { work, qa }] = await Promise.all([params, searchParams]);
  return <Preview id={id} initialArtworkId={work} qaId={qa} />;
}
