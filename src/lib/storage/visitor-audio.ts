import "server-only";
import { z } from "zod";
import { rpc } from "../api/db";
import { decodeDatabase } from "../api/publication";
import { createWorkerSupabase } from "../supabase/worker";

/** Separate from the expiring request ledger so a crash cannot orphan stored audio. */
export async function cleanupVisitorAudio() {
  const worker = createWorkerSupabase({ timeoutMs: 15_000 });
  const tasks = decodeDatabase(z.array(z.strictObject({ id: z.uuid(), storageKey: z.string().regex(/^requests\/[a-f0-9-]{36}\.mp3$/) })),
    await rpc(worker, "list_visitor_audio_cleanup", { p_limit: 50 }));
  let completed = 0;
  for (let offset = 0; offset < tasks.length; offset += 5) {
    await Promise.all(tasks.slice(offset, offset + 5).map(async task => {
      try {
        const { error } = await worker.storage.from("visitor-audio").remove([task.storageKey]);
        if (error) throw error;
        if (await rpc(worker, "complete_visitor_audio_cleanup", { p_id: task.id }) === true) completed++;
      } catch { console.error("visitor_audio_cleanup_pending", { assetId: task.id }); }
    }));
  }
  return { attempted: tasks.length, completed };
}
