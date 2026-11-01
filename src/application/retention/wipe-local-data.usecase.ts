/**
 * Guarded deletion of all local user data.
 *
 * Financial tables, receipts, drafts, identity and local settings are removed;
 * the schema and the durable file-cleanup queue survive so receipt files can be
 * removed after the commit. This is irreversible without a backup.
 */

export interface LocalDataWipePreview {
  readonly groups: number;
  readonly expenses: number;
  readonly settlements: number;
  readonly receipts: number;
}

export interface LocalDataWipeStore {
  preview(): Promise<LocalDataWipePreview>;
  wipe(): Promise<{ readonly filesQueued: number }>;
}

export class WipeAllLocalDataUseCase {
  constructor(private readonly store: LocalDataWipeStore) {}

  async preview(): Promise<LocalDataWipePreview> {
    return this.store.preview();
  }

  async execute(confirmation: string): Promise<{ filesQueued: number }> {
    if (confirmation.trim() !== 'DELETE') {
      throw new Error('Type DELETE exactly to confirm local data erasure.');
    }
    return this.store.wipe();
  }
}
