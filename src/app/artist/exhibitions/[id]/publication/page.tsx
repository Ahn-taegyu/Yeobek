import { Publication } from "@/components/artist/publication";

export default async function PublicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Publication key={id} id={id} />;
}
