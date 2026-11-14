import { Preview } from "@/components/artist/review";

export default async function PreviewPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ work?: string }>;
}) {
  const [{ id }, { work }] = await Promise.all([params, searchParams]);
  return <Preview id={id} initialArtworkId={work} />;
}
