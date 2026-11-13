import "server-only";
import type { PlaybookId } from "./plugin";
import { yeobekPlugin } from "./plugin.generated";

export type PlaybookStepId<Id extends PlaybookId> = (typeof yeobekPlugin.playbooks)[Id]["steps"][number]["id"];

/** Internal execution metadata. Reasons are static codes. */
export type PlaybookStepRecord = Readonly<{
  id: string;
  status: "done" | "skipped" | "failed";
  reason?: string;
  elapsedMs: number;
}>;

export class PlaybookOrderError extends Error {
  constructor(code: "step_out_of_order" | "step_pending" | "playbook_failed" | "playbook_incomplete" |
    "playbook_finished" | "invalid_skip_reason" | "invalid_playbook_failure") {
    super(code);
    this.name = "PlaybookOrderError";
  }
}

const failureSteps = new WeakMap<object, readonly PlaybookStepRecord[]>();

function canTrack(error: unknown): error is object {
  return (typeof error === "object" && error !== null) || typeof error === "function";
}

export function getPlaybookFailureSteps(error: unknown): readonly PlaybookStepRecord[] | undefined {
  return canTrack(error) ? failureSteps.get(error) : undefined;
}

export function startPlaybook<Id extends PlaybookId>(id: Id) {
  const declared = yeobekPlugin.playbooks[id].steps;
  const records: PlaybookStepRecord[] = [];
  let pending = false;
  let finished = false;
  let failure: { error: unknown } | undefined;

  function assertIdle() {
    if (finished) throw new PlaybookOrderError("playbook_finished");
    if (pending) throw new PlaybookOrderError("step_pending");
  }

  function assertNext(stepId: PlaybookStepId<Id>) {
    assertIdle();
    if (failure) throw new PlaybookOrderError("playbook_failed");
    const next = declared[records.length];
    if (!next || next.id !== stepId) throw new PlaybookOrderError("step_out_of_order");
  }

  function record(entry: PlaybookStepRecord) {
    records.push(Object.freeze(entry));
  }

  function snapshot() {
    finished = true;
    return Object.freeze([...records]);
  }

  return {
    async step<T>(stepId: PlaybookStepId<Id>, fn: () => T | PromiseLike<T>): Promise<T> {
      assertNext(stepId);
      pending = true;
      const start = performance.now();
      try {
        const result = await fn();
        record({ id: stepId, status: "done", elapsedMs: performance.now() - start });
        return result;
      } catch (error) {
        failure = { error };
        record({ id: stepId, status: "failed", elapsedMs: performance.now() - start });
        throw error;
      } finally {
        pending = false;
      }
    },
    skip(stepId: PlaybookStepId<Id>, reason: string) {
      assertNext(stepId);
      if (typeof reason !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(reason)) {
        throw new PlaybookOrderError("invalid_skip_reason");
      }
      record({ id: stepId, status: "skipped", reason, elapsedMs: 0 });
    },
    finish() {
      assertIdle();
      if (failure) throw new PlaybookOrderError("playbook_failed");
      if (records.length !== declared.length) throw new PlaybookOrderError("playbook_incomplete");
      return snapshot();
    },
    /** A reserved job must settle even after an earlier operational failure. */
    async settleJob(complete: ((steps: readonly PlaybookStepRecord[]) => Promise<void>) | undefined) {
      const stepId = "job.complete" as PlaybookStepId<Id>;
      assertIdle();
      if (declared.at(-1)?.id !== stepId) throw new PlaybookOrderError("step_out_of_order");
      const previousFailure = failure;
      if (previousFailure) {
        for (const step of declared.slice(records.length, -1)) {
          record({ id: step.id, status: "skipped", reason: "previous_step_failed", elapsedMs: 0 });
        }
        failure = undefined;
      }
      try {
        if (complete) await this.step(stepId, () => complete(Object.freeze([...records])));
        else this.skip(stepId, "job_unbound");
      } catch (error) {
        if (!(error instanceof PlaybookOrderError)) this.fail(error);
        throw error;
      }
      const steps = this.finish();
      if (previousFailure && canTrack(previousFailure.error)) failureSteps.set(previousFailure.error, steps);
      return steps;
    },
    /** Close an operational failure so callers can propagate the original error. */
    fail(error: unknown) {
      assertIdle();
      if (error instanceof PlaybookOrderError) throw error;
      if (!failure || !Object.is(failure.error, error)) throw new PlaybookOrderError("invalid_playbook_failure");
      for (const step of declared.slice(records.length)) {
        record({ id: step.id, status: "skipped", reason: "previous_step_failed", elapsedMs: 0 });
      }
      const steps = snapshot();
      if (canTrack(error)) failureSteps.set(error, steps);
      return steps;
    },
  };
}
