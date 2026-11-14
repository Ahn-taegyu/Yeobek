import { NarrationList } from "@/components/artist/narration-list";

export default async function NarrationListPage({ params }: { params: Promise<{ id: string }> }) {
  return <NarrationList id={(await params).id} />;
}
