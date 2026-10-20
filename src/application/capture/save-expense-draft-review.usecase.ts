/**
 * SaveExpenseDraftReviewUseCase — persists the user's edits from the
 * draft-review screen (v2.4.0).
 *
 * Until v2.3.0 the review screen edited a draft that lived ONLY in the
 * zustand store — confirming or navigating away lost the edits and the
 * draft never reached SQLite. This use case is the write path:
 *
 *   1. Loads the persisted draft (must exist).
 *   2. Enforces optimistic concurrency: the caller's `expectedVersion`
 *      must match the persisted version (a mismatch means another flow
 *      — boot recovery, a second device, a replayed pipeline — touched
 *      the draft; the user is told to re-open it).
 *   3. Validates the incoming draft is not in a terminal status.
 *   4. Saves the edited entity (full-replacement, atomic).
 *
 * The use case deliberately does NOT transition the draft's status —
 * field edits keep the current status (`needs_review`/`ready`);
 * confirmation is a separate, atomic use case
 * (`CreateExpenseFromDraftUseCase`).
 */

import type { ExpenseDraft } from '@domain/entities';
import { InvalidEntityError } from '@domain/errors';
import type { ExpenseDraftRepository } from '@domain/repositories/expense-draft.repository';
import type { ExpenseDraftId } from '@shared-types/index';

export interface SaveExpenseDraftReviewInput {
  /** The edited draft entity (id + expectedVersion identify the row). */
  readonly draft: ExpenseDraft;
  /** Version the caller last saw (optimistic-concurrency guard). */
  readonly expectedVersion: number;
}

export class SaveExpenseDraftReviewUseCase {
  constructor(private readonly drafts: ExpenseDraftRepository) {}

  async execute(input: SaveExpenseDraftReviewInput): Promise<ExpenseDraft> {
    const { draft, expectedVersion } = input;
    const persisted = await this.drafts.findById(draft.id);
    if (persisted === null) {
      throw new InvalidEntityError(`Draft ${draft.id} no longer exists on this device.`);
    }
    if (persisted.version !== expectedVersion) {
      throw new InvalidEntityError(
        `Draft ${draft.id} was modified by another flow (expected version ` +
          `${expectedVersion}, persisted ${persisted.version}). Please reopen the draft.`,
      );
    }
    if (draft.status === 'confirmed' || draft.status === 'discarded') {
      throw new InvalidEntityError(`Draft ${draft.id} is ${draft.status} and cannot be edited.`);
    }
    await this.drafts.save(draft);
    return draft;
  }
}

/** Load a persisted draft for review (read side of the same flow). */
export class GetExpenseDraftUseCase {
  constructor(private readonly drafts: ExpenseDraftRepository) {}

  async execute(draftId: ExpenseDraftId): Promise<ExpenseDraft | null> {
    return this.drafts.findById(draftId);
  }
}
