/**
 * DiscardExpenseDraftUseCase — persists a draft discard (v2.26.0).
 *
 * Until v2.25.0 the review screen's Discard action only cleared the
 * zustand store: the persisted draft stayed `needs_review` in SQLite and
 * reappeared in the drafts inbox forever. This use case is the durable
 * write path:
 *
 *   1. Loads the persisted draft (must exist).
 *   2. Applies the domain `discardExpenseDraft` transition (rejects a
 *      `confirmed` draft; optional optimistic-concurrency check).
 *   3. Saves the discarded entity.
 *
 * Discarding does NOT delete the underlying CaptureSource — the user can
 * re-run extraction from the same image (see `expense-draft.ts`).
 */

import { discardExpenseDraft } from '@domain/entities';
import { InvalidEntityError } from '@domain/errors';
import type { ExpenseDraftRepository } from '@domain/repositories/expense-draft.repository';
import type { ExpenseDraftId } from '@shared-types/index';

export interface DiscardExpenseDraftInput {
  readonly draftId: ExpenseDraftId;
  /**
   * Version the caller last saw. When provided, a mismatch throws
   * (another flow touched the draft). Optional to match the domain
   * transition's signature.
   */
  readonly expectedVersion?: number;
}

export class DiscardExpenseDraftUseCase {
  constructor(private readonly drafts: ExpenseDraftRepository) {}

  async execute(input: DiscardExpenseDraftInput): Promise<'discarded'> {
    const persisted = await this.drafts.findById(input.draftId);
    if (persisted === null) {
      throw new InvalidEntityError(`Draft ${input.draftId} no longer exists on this device.`);
    }
    if (persisted.status === 'discarded') {
      // Idempotent: an already-discarded draft needs no further write.
      return 'discarded';
    }
    const discarded = discardExpenseDraft(persisted, undefined, input.expectedVersion);
    await this.drafts.save(discarded);
    return 'discarded';
  }
}
