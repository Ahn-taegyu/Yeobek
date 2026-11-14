import { VerificationHub } from "@/components/artist/flow";

export default async function VerificationPage({ params }: { params: Promise<{ id: string }> }) {
  return <VerificationHub id={(await params).id} />;
}
