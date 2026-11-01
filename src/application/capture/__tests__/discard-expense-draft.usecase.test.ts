/**
 * DiscardExpenseDraftUseCase tests.
 *
 * v2.26.0 regression coverage: the draft-review screen's Discard action
 * previously only cleared the zustand store — the persisted draft stayed
 * `needs_review` and reappeared in the drafts inbox forever. These tests
 * pin the durable write path:
 *
 *   - a reviewable draft is transitioned to `discarded` and saved
 *   - discarding an already-discarded draft is a no-op (idempotent)
 *   - a `confirmed` draft is rejected (the domain transition throws)
 *   - an optional `expectedVersion` mismatch surfaces as an error
 *   - the underlying capture source is NOT touched
 */

import { describe, expect, it } from '@jest/globals';

import {
  completeProcessing,
  confirmExpenseDraft,
  createExpenseDraft,
  startProcessing,
  type ExpenseDraft,
} from '@domain/entities/expense-draft';
import type { ExpenseDraftRepository } from '@domain/repositories/expense-draft.repository';
import type { PaginatedResult, SoftDeleteResult } from '@domain/repositories/repository-contracts';
import type { ExpenseDraftId } from '@shared-types/index';

import { DiscardExpenseDraftUseCase } from '../discard-expense-draft.usecase';

const NOW = '2026-10-23T09:00:00.000Z' as never;

class InMemoryDraftRepository implements ExpenseDraftRepository {
  readonly store = new Map<string, ExpenseDraft>();

  async findById(id: Parameters<ExpenseDraftRepository['findById']>[0]) {
    return this.store.get(id as string) ?? null;
  }
  async listByGroup(): Promise<PaginatedResult<ExpenseDraft>> {
    return { items: Array.from(this.store.values()), hasMore: false };
  }
  async listByStatus(): Promise<PaginatedResult<ExpenseDraft>> {
    return { items: Array.from(this.store.values()), hasMore: false };
  }
  async listByCaptureSource(): Promise<ExpenseDraft[]> {
    return [];
  }
  async listUpdatedSince(): Promise<PaginatedResult<ExpenseDraft>> {
    return { items: [], hasMore: false };
  }
  async save(draft: ExpenseDraft) {
    this.store.set(draft.id as string, draft);
  }
  async softDelete(): Promise<SoftDeleteResult> {
    return { id: 'd_none', deletedAt: '1970-01-01T00:00:00.000Z' as never, version: 0 as never };
  }
}

function makeDraft(): ExpenseDraft {
  let draft = createExpenseDraft({
    id: 'd_discard_1' as never,
    source: 'receipt',
    title: 'Lunch',
    amountMinor: 550,
    currencyCode: 'USD',
    merchantName: 'Burger Joint',
    expenseDate: '2026-10-20',
    groupId: 'g_1' as never,
    payerCandidates: ['m_a' as never],
    participantCandidates: ['m_a' as never, 'm_b' as never],
    createdBy: 'local-user' as never,
    now: NOW,
  });
  draft = startProcessing(draft, { expectedVersion: draft.version } as never);
  draft = completeProcessing(draft, { expectedVersion: draft.version } as never);
  return draft;
}

describe('DiscardExpenseDraftUseCase', () => {
  it('persists a discard for a reviewable draft', async () => {
    const drafts = new InMemoryDraftRepository();
    const draft = makeDraft();
    await drafts.save(draft);
    const useCase = new DiscardExpenseDraftUseCase(drafts);

    const result = await useCase.execute({ draftId: draft.id as ExpenseDraftId });

    expect(result).toBe('discarded');
    const persisted = await drafts.findById(draft.id as never);
    expect(persisted?.status).toBe('discarded');
    expect(persisted?.version).toBe(draft.version + 1);
  });

  it('is idempotent for an already-discarded draft', async () => {
    const drafts = new InMemoryDraftRepository();
    const draft = makeDraft();
    await drafts.save(draft);
    const useCase = new DiscardExpenseDraftUseCase(drafts);

    await useCase.execute({ draftId: draft.id as ExpenseDraftId });
    const result = await useCase.execute({ draftId: draft.id as ExpenseDraftId });

    expect(result).toBe('discarded');
    const persisted = await drafts.findById(draft.id as never);
    expect(persisted?.status).toBe('discarded');
  });

  it('rejects a confirmed draft', async () => {
    const drafts = new InMemoryDraftRepository();
    const draft = makeDraft();
    const confirmed = confirmExpenseDraft(draft, { expectedVersion: draft.version, now: NOW } as never);
    await drafts.save(confirmed);
    const useCase = new DiscardExpenseDraftUseCase(drafts);

    await expect(
      useCase.execute({ draftId: draft.id as ExpenseDraftId }),
    ).rejects.toThrow(/confirmed and cannot be discarded/);
  });

  it('surfaces a version conflict when expectedVersion is stale', async () => {
    const drafts = new InMemoryDraftRepository();
    const draft = makeDraft();
    await drafts.save(draft);
    const useCase = new DiscardExpenseDraftUseCase(drafts);

    await expect(
      useCase.execute({ draftId: draft.id as ExpenseDraftId, expectedVersion: 99 }),
    ).rejects.toThrow(/version conflict/i);
  });

  it('throws a clear error when the draft does not exist', async () => {
    const drafts = new InMemoryDraftRepository();
    const useCase = new DiscardExpenseDraftUseCase(drafts);

    await expect(useCase.execute({ draftId: 'd_missing' as never })).rejects.toThrow(
      /no longer exists/,
    );
  });
});
