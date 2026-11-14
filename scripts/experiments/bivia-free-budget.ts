import { closeSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { validateFreeRun, type preflight } from "./bivia-retrieval";

/** Reserve the entire run before the first request. Interrupted/failed runs do
 * not refund local quota. A fresh provider-account observation can replace it.
 */
export function reserveAllowance(path: string, plan: ReturnType<typeof preflight>, maxCalls: number) {
  const lockPath = `${path}.lock`;
  let fd: number;
  try { fd = openSync(lockPath, "wx"); } catch { throw new Error("free_allowance_locked_or_missing_directory"); }
  const release = () => { closeSync(fd); unlinkSync(lockPath); };
  try {
    const allowance = validateFreeRun(JSON.parse(readFileSync(path, "utf8")), plan, maxCalls);
    writeFileSync(`${path}.tmp`, JSON.stringify({ ...allowance,
      freeTokensRemaining: allowance.freeTokensRemaining - plan.reservedTokens,
      freeRequestsRemaining: allowance.freeRequestsRemaining - plan.calls,
    }, null, 2) + "\n");
    renameSync(`${path}.tmp`, path);
    return { allowance, release };
  } catch (error) {
    release();
    throw new Error(error instanceof Error && /^free_[a-z_]+$/.test(error.message) ? error.message : "free_allowance_unreadable");
  }
}
