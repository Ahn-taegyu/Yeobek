import { VisitorExhibition } from "@/components/visitor/visitor-exhibition";

export default async function ExhibitionPage({ params }: {
  params: Promise<{ exhibitionId: string }>;
}) {
  const { exhibitionId } = await params;
  return <VisitorExhibition key={exhibitionId} exhibitionId={exhibitionId} />;
}
