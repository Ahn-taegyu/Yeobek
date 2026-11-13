import { authorizeCron } from "@/lib/api/cron";
import { rpc } from "@/lib/api/db";
import { handleApi } from "@/lib/api/http";
import { decodeDatabase } from "@/lib/api/publication";
import { purgeResponse } from "@/lib/contracts/visitor";
import { createWorkerSupabase } from "@/lib/supabase/worker";
import { cleanupMaterials } from "@/lib/storage/materials";
import { cleanupAudio } from "@/lib/storage/audio";
import { cleanupVisitorAudio } from "@/lib/storage/visitor-audio";

export function POST(request: Request) {
  return handleApi(async () => {
    authorizeCron(request);
    const purged = decodeDatabase(purgeResponse, await rpc(createWorkerSupabase({ timeoutMs: 15_000 }), "purge_expired", {}));
    const [materials, audio, visitorAudio] = await Promise.all([cleanupMaterials(), cleanupAudio(), cleanupVisitorAudio()]);
    return { ...purged, materials, audio, visitorAudio };
  });
}
