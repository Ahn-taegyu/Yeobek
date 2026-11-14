import { Faq } from "@/components/artist/review";

export default async function FaqPage({ params }: { params: Promise<{ id: string }> }) {
  return <Faq id={(await params).id} />;
}
