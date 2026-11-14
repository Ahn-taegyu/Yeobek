import { decideOutbox } from "@/lib/api/outbox";

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return decideOutbox(request, context.params, false);
}
