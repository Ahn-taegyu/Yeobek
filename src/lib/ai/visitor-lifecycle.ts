import type { ChatRequest, DocentReply } from "./contracts";

/** Bound only by the server service. SQL owns quotas, session scope and expiry. */
export interface VisitorLifecycle {
  reserve(request: ChatRequest): Promise<void>;
  store(reply: Omit<DocentReply, "steps">): Promise<void>;
  recordGap?: (question: string, reply: Omit<DocentReply, "steps">) => Promise<boolean>;
}
