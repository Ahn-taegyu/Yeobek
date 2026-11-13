import "server-only";

export interface JobLifecycle<Result> {
  reserve(): Promise<void>;
  complete(result: Result): Promise<void>;
}
