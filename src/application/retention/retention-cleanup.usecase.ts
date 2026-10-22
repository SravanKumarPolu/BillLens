/**
 * Bounded cleanup of unreferenced temporary receipt files.
 *
 * Financial history is never deleted here. Only files not referenced by
 * receipts/capture sources and older than the retention cutoff are enqueued in
 * the existing durable `file_cleanup_queue`; the queue worker performs deletion.
 */

export interface RetentionCleanupStore {
  findOrphanFiles(cutoffIso: string, limit: number): Promise<readonly string[]>;
  enqueueCleanup(uris: readonly string[], nowIso: string): Promise<number>;
}

export interface RetentionCleanupResult {
  readonly candidates: number;
  readonly queued: number;
}

export class RetentionCleanupUseCase {
  constructor(private readonly store: RetentionCleanupStore) {}

  async execute(input: {
    readonly now?: Date;
    readonly retentionDays: number;
    readonly limit?: number;
  }): Promise<RetentionCleanupResult> {
    const now = input.now ?? new Date();
    const cutoff = new Date(
      now.getTime() - Math.max(1, Math.floor(input.retentionDays)) * 86_400_000,
    ).toISOString();
    const uris = await this.store.findOrphanFiles(cutoff, Math.min(50, input.limit ?? 50));
    if (uris.length === 0) return { candidates: 0, queued: 0 };
    const queued = await this.store.enqueueCleanup(uris, now.toISOString());
    return { candidates: uris.length, queued };
  }
}
