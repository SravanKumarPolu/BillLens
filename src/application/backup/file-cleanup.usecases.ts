/**
 * Durable receipt-file cleanup outbox.
 *
 * Deletion writes queue rows in the same SQLite transaction as the record
 * removal. Processing is idempotent, bounded and retries with backoff; a
 * missing file is treated as success. Files still referenced by another
 * group's receipt are never enqueued.
 */

export interface FileCleanupJob {
  readonly id: string;
  readonly uri: string;
  readonly attempts: number;
  readonly reason: string;
}

export interface FileCleanupStore {
  listDue(now: string, limit: number): Promise<readonly FileCleanupJob[]>;
  markComplete(id: string, now: string): Promise<void>;
  reschedule(id: string, error: string, nextAttemptAt: string, now: string): Promise<void>;
  pruneCompleted(before: string, limit: number): Promise<number>;
}

export interface FileCleanupResult {
  readonly processed: number;
  readonly completed: number;
  readonly retried: number;
  readonly failedPermanently: number;
}

export const MAX_CLEANUP_ATTEMPTS = 5;

const BACKOFF_MINUTES = [1, 5, 30, 120, 720] as const;

export class ProcessFileCleanupQueueUseCase {
  constructor(
    private readonly store: FileCleanupStore,
    private readonly removeFile: (uri: string) => Promise<void>,
  ) {}

  async execute(now = new Date().toISOString(), limit = 10): Promise<FileCleanupResult> {
    const jobs = await this.store.listDue(now, Math.max(1, Math.min(50, limit)));
    let completed = 0;
    let retried = 0;
    let failedPermanently = 0;

    for (const job of jobs) {
      try {
        await this.removeFile(job.uri);
        await this.store.markComplete(job.id, now);
        completed += 1;
      } catch (error) {
        const attempts = job.attempts + 1;
        if (attempts >= MAX_CLEANUP_ATTEMPTS) {
          // Keep the row for diagnostics but stop retrying forever.
          await this.store.reschedule(
            job.id,
            error instanceof Error ? error.message.slice(0, 200) : 'unknown error',
            '9999-12-31T00:00:00.000Z',
            now,
          );
          failedPermanently += 1;
        } else {
          const backoff = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)] ?? 60;
          const next = new Date(Date.parse(now) + backoff * 60_000).toISOString();
          await this.store.reschedule(
            job.id,
            error instanceof Error ? error.message.slice(0, 200) : 'unknown error',
            next,
            now,
          );
          retried += 1;
        }
      }
    }

    await this.store.pruneCompleted(new Date(Date.parse(now) - 30 * 86_400_000).toISOString(), 100);
    return { processed: jobs.length, completed, retried, failedPermanently };
  }
}
