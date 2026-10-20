import { beforeEach, describe, expect, it } from '@jest/globals';

import {
  asGroupId,
  asMemberId,
  asSettlementId,
  asUserId,
  createSettlement,
} from '@domain/entities';
import {
  InvalidEntityError,
} from '@domain/errors';
import { asDateTime } from '@domain/value-objects';
import type { SettlementId } from '@shared-types/index';

import {
  CorrectSettlementAmountUseCase,
  DisputeSettlementUseCase,
  ListDisputedSettlementsUseCase,
  ListPendingConfirmationsUseCase,
  MarkDuplicateSettlementUseCase,
  RecordSettlementUseCase,
  RequestMoreInfoUseCase,
  ResolveDisputeUseCase,
} from '../index';

import {
  InMemorySettlementRepository,
  InMemoryAuditRepository,
} from './_in-memory-repositories';

// ── Fixtures ────────────────────────────────────────────────────────
const NOW = asDateTime('2026-10-10T10:00:00.000Z');
const USER_ID = asUserId('user-1');
const GROUP_ID = asGroupId('group-1');
const FROM_MEMBER = asMemberId('m-1');
const TO_MEMBER = asMemberId('m-2');

function setup() {
  const settlements = new InMemorySettlementRepository();
  const audit = new InMemoryAuditRepository();
  return { settlements, audit };
}

/**
 * Build a pending_confirmation settlement by creating a draft,
 * then recording it via the RecordSettlementUseCase.
 */
async function makePending(
  settlements: InMemorySettlementRepository,
  audit: InMemoryAuditRepository,
  id = 's-1',
  amount = 500,
): Promise<SettlementId> {
  const create = createSettlement({
    id: asSettlementId(id),
    groupId: GROUP_ID,
    fromMemberId: FROM_MEMBER,
    toMemberId: TO_MEMBER,
    amountMinor: amount,
    currencyCode: 'INR',
    method: 'upi',
    createdBy: USER_ID,
    now: NOW,
    status: 'draft',
  });
  settlements.seed(create);
  const record = new RecordSettlementUseCase(settlements, audit);
  const result = await record.execute({
    settlementId: create.id,
    expectedVersion: 1,
    actorId: USER_ID,
    now: NOW,
  });
  return result.settlement.id;
}

// ── Tests ──────────────────────────────────────────────────────────

describe('Phase 6 Track 5 — Confirmation + disputes (Prompt 57)', () => {
  let settlements: InMemorySettlementRepository;
  let audit: InMemoryAuditRepository;

  beforeEach(() => {
    ({ settlements, audit } = setup());
  });

  // ── DisputeSettlementUseCase ──────────────────────────────

  describe('DisputeSettlementUseCase', () => {
    it('transitions pending_confirmation → disputed with a structured reason', async () => {
      const id = await makePending(settlements, audit);
      const useCase = new DisputeSettlementUseCase(settlements, audit);
      const result = await useCase.execute({
        settlementId: id,
        expectedVersion: 2,
        reason: 'not_received',
        note: 'I did not receive any payment',
        actorId: USER_ID,
        actorMemberId: TO_MEMBER,
      });
      expect(result.settlement.status).toBe('disputed');
      expect(result.settlement.disputeReason).toBe('not_received');
      expect(result.settlement.disputeNote).toBe('I did not receive any payment');
    });

    it('appends a state-history entry', async () => {
      const id = await makePending(settlements, audit);
      const useCase = new DisputeSettlementUseCase(settlements, audit);
      await useCase.execute({
        settlementId: id,
        expectedVersion: 2,
        reason: 'wrong_amount',
        actorId: USER_ID,
      });
      const history = settlements.stateHistoryFor(id);
      // 2 entries: draft→pending_confirmation (from makePending) + pending_confirmation→disputed
      expect(history).toHaveLength(2);
      expect(history[0]?.toStatus).toBe('pending_confirmation');
      expect(history[1]?.fromStatus).toBe('pending_confirmation');
      expect(history[1]?.toStatus).toBe('disputed');
    });

    it('throws on invalid transition (from completed)', async () => {
      // Create a completed settlement
      settlements.seed(createSettlement({
        id: asSettlementId('s-completed'),
        groupId: GROUP_ID,
        fromMemberId: FROM_MEMBER,
        toMemberId: TO_MEMBER,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ID,
        now: NOW,
        status: 'completed',
      }));
      const useCase = new DisputeSettlementUseCase(settlements, audit);
      await expect(
        useCase.execute({
          settlementId: asSettlementId('s-completed'),
          expectedVersion: 1,
          reason: 'not_received',
        }),
      ).rejects.toThrow(); // InvalidStateTransitionError from the state machine
    });

    it('throws on not-found', async () => {
      const useCase = new DisputeSettlementUseCase(settlements, audit);
      await expect(
        useCase.execute({
          settlementId: asSettlementId('nope'),
          expectedVersion: 1,
          reason: 'not_received',
        }),
      ).rejects.toThrow(InvalidEntityError);
    });
  });

  // ── ResolveDisputeUseCase ────────────────────────────────

  describe('ResolveDisputeUseCase', () => {
    async function makeDisputed(reason: 'not_received' | 'wrong_amount' = 'not_received') {
      const id = await makePending(settlements, audit);
      const dispute = new DisputeSettlementUseCase(settlements, audit);
      const result = await dispute.execute({
        settlementId: id,
        expectedVersion: 2,
        reason,
        actorId: USER_ID,
      });
      return result.settlement;
    }

    it('resolves disputed → completed (accept the payment)', async () => {
      const disputed = await makeDisputed();
      const useCase = new ResolveDisputeUseCase(settlements, audit);
      const result = await useCase.execute({
        settlementId: disputed.id,
        expectedVersion: 3,
        resolution: 'completed',
        confirmedByMemberId: TO_MEMBER,
        actorId: USER_ID,
      });
      expect(result.settlement.status).toBe('completed');
      expect(result.settlement.confirmedByMemberId).toBe(TO_MEMBER);
      expect(result.settlement.confirmedAt).toBeTruthy();
    });

    it('resolves disputed → cancelled (reject the payment)', async () => {
      const disputed = await makeDisputed();
      const useCase = new ResolveDisputeUseCase(settlements, audit);
      const result = await useCase.execute({
        settlementId: disputed.id,
        expectedVersion: 3,
        resolution: 'cancelled',
        actorId: USER_ID,
      });
      expect(result.settlement.status).toBe('cancelled');
    });

    it('throws when resolving to "completed" without confirmedByMemberId', async () => {
      const disputed = await makeDisputed();
      const useCase = new ResolveDisputeUseCase(settlements, audit);
      await expect(
        useCase.execute({
          settlementId: disputed.id,
          expectedVersion: 3,
          resolution: 'completed',
          // missing confirmedByMemberId
        }),
      ).rejects.toThrow(InvalidEntityError);
    });

    it('throws when resolving a non-disputed settlement', async () => {
      const id = await makePending(settlements, audit);
      const useCase = new ResolveDisputeUseCase(settlements, audit);
      await expect(
        useCase.execute({
          settlementId: id,
          expectedVersion: 2,
          resolution: 'completed',
          confirmedByMemberId: TO_MEMBER,
        }),
      ).rejects.toThrow();
    });
  });

  // ── RequestMoreInfoUseCase ───────────────────────────────

  describe('RequestMoreInfoUseCase', () => {
    it('appends an audit entry without changing the settlement status', async () => {
      const id = await makePending(settlements, audit);
      const useCase = new RequestMoreInfoUseCase(settlements, audit);
      await useCase.execute({
        settlementId: id,
        note: 'Which UPI app did you use?',
        actorId: USER_ID,
      });
      // The settlement stays in pending_confirmation
      const s = await settlements.findById(id);
      expect(s?.status).toBe('pending_confirmation');
      // The audit entry was appended
      expect(audit.entries).toHaveLength(2); // record + request-more-info
      const requestEntry = audit.entries[1];
      const summary = JSON.stringify(requestEntry?.changeSummary ?? {});
      expect(summary).toContain('requestMoreInfo');
      expect(summary).toContain('Which UPI app');
    });

    it('throws on empty note', async () => {
      const id = await makePending(settlements, audit);
      const useCase = new RequestMoreInfoUseCase(settlements, audit);
      await expect(
        useCase.execute({ settlementId: id, note: '   ' }),
      ).rejects.toThrow(InvalidEntityError);
    });

    it('throws on a non-pending_confirmation settlement', async () => {
      settlements.seed(createSettlement({
        id: asSettlementId('s-draft'),
        groupId: GROUP_ID,
        fromMemberId: FROM_MEMBER,
        toMemberId: TO_MEMBER,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ID,
        now: NOW,
        status: 'draft',
      }));
      const useCase = new RequestMoreInfoUseCase(settlements, audit);
      await expect(
        useCase.execute({
          settlementId: asSettlementId('s-draft'),
          note: 'test',
        }),
      ).rejects.toThrow(InvalidEntityError);
    });
  });

  // ── MarkDuplicateSettlementUseCase ───────────────────────

  describe('MarkDuplicateSettlementUseCase', () => {
    it('transitions pending_confirmation → disputed with reason "duplicate"', async () => {
      const id = await makePending(settlements, audit);
      const useCase = new MarkDuplicateSettlementUseCase(settlements, audit);
      const result = await useCase.execute({
        settlementId: id,
        expectedVersion: 2,
        duplicateOfSettlementId: asSettlementId('s-other'),
        actorId: USER_ID,
      });
      expect(result.settlement.status).toBe('disputed');
      expect(result.settlement.disputeReason).toBe('duplicate');
      expect(result.settlement.disputeNote).toContain('Duplicate of settlement s-other');
    });

    it('works without a duplicateOfSettlementId', async () => {
      const id = await makePending(settlements, audit);
      const useCase = new MarkDuplicateSettlementUseCase(settlements, audit);
      const result = await useCase.execute({
        settlementId: id,
        expectedVersion: 2,
      });
      expect(result.settlement.disputeNote).toContain('Likely duplicate');
    });

    it('throws on a non-pending_confirmation settlement', async () => {
      settlements.seed(createSettlement({
        id: asSettlementId('s-draft'),
        groupId: GROUP_ID,
        fromMemberId: FROM_MEMBER,
        toMemberId: TO_MEMBER,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ID,
        now: NOW,
        status: 'draft',
      }));
      const useCase = new MarkDuplicateSettlementUseCase(settlements, audit);
      await expect(
        useCase.execute({
          settlementId: asSettlementId('s-draft'),
          expectedVersion: 1,
        }),
      ).rejects.toThrow(InvalidEntityError);
    });
  });

  // ── CorrectSettlementAmountUseCase ───────────────────────

  describe('CorrectSettlementAmountUseCase', () => {
    it('disputes the original and creates a new draft with the corrected amount', async () => {
      const id = await makePending(settlements, audit, 's-1', 500);
      const useCase = new CorrectSettlementAmountUseCase(settlements, audit);
      const result = await useCase.execute({
        settlementId: id,
        expectedVersion: 2,
        correctedAmountMinor: 400,
        actorId: USER_ID,
      });
      // Original is disputed
      expect(result.disputedSettlement.status).toBe('disputed');
      expect(result.disputedSettlement.disputeReason).toBe('wrong_amount');
      // New draft has the corrected amount
      expect(result.correctedDraft.status).toBe('draft');
      expect(result.correctedDraft.amountMinor).toBe(400);
      expect(result.correctedDraft.fromMemberId).toBe(FROM_MEMBER);
      expect(result.correctedDraft.toMemberId).toBe(TO_MEMBER);
      expect(result.correctedDraft.note).toContain('Correction of settlement s-1');
    });

    it('preserves the original evidence hash on the corrected draft', async () => {
      // Create a pending settlement with an evidence hash
      settlements.seed(createSettlement({
        id: asSettlementId('s-1'),
        groupId: GROUP_ID,
        fromMemberId: FROM_MEMBER,
        toMemberId: TO_MEMBER,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ID,
        now: NOW,
        status: 'pending_confirmation',
        evidenceHash: 'b'.repeat(64),
      }));
      const useCase = new CorrectSettlementAmountUseCase(settlements, audit);
      const result = await useCase.execute({
        settlementId: asSettlementId('s-1'),
        expectedVersion: 1,
        correctedAmountMinor: 400,
        actorId: USER_ID,
      });
      expect(result.correctedDraft.evidenceHash).toBe('b'.repeat(64));
    });

    it('throws when the corrected amount equals the original', async () => {
      const id = await makePending(settlements, audit, 's-1', 500);
      const useCase = new CorrectSettlementAmountUseCase(settlements, audit);
      await expect(
        useCase.execute({
          settlementId: id,
          expectedVersion: 2,
          correctedAmountMinor: 500, // same as original
          actorId: USER_ID,
        }),
      ).rejects.toThrow(InvalidEntityError);
    });

    it('throws on a non-pending_confirmation settlement', async () => {
      settlements.seed(createSettlement({
        id: asSettlementId('s-draft'),
        groupId: GROUP_ID,
        fromMemberId: FROM_MEMBER,
        toMemberId: TO_MEMBER,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ID,
        now: NOW,
        status: 'draft',
      }));
      const useCase = new CorrectSettlementAmountUseCase(settlements, audit);
      await expect(
        useCase.execute({
          settlementId: asSettlementId('s-draft'),
          expectedVersion: 1,
          correctedAmountMinor: 400,
        }),
      ).rejects.toThrow(InvalidEntityError);
    });

    it('throws on a non-positive corrected amount', async () => {
      const id = await makePending(settlements, audit, 's-1', 500);
      const useCase = new CorrectSettlementAmountUseCase(settlements, audit);
      await expect(
        useCase.execute({
          settlementId: id,
          expectedVersion: 2,
          correctedAmountMinor: 0,
        }),
      ).rejects.toThrow(InvalidEntityError);
    });
  });

  // ── ListPendingConfirmationsUseCase ──────────────────────

  describe('ListPendingConfirmationsUseCase', () => {
    it('lists pending_confirmation settlements for the group', async () => {
      await makePending(settlements, audit, 's-1');
      await makePending(settlements, audit, 's-2');
      // Also create a draft (should NOT appear)
      settlements.seed(createSettlement({
        id: asSettlementId('s-draft'),
        groupId: GROUP_ID,
        fromMemberId: FROM_MEMBER,
        toMemberId: TO_MEMBER,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ID,
        now: NOW,
        status: 'draft',
      }));
      const useCase = new ListPendingConfirmationsUseCase(settlements);
      const result = await useCase.execute({
        groupId: GROUP_ID,
        pagination: { limit: 10 },
      });
      expect(result.items).toHaveLength(2);
      for (const s of result.items) {
        expect(s.status).toBe('pending_confirmation');
      }
    });

    it('returns empty when there are no pending confirmations', async () => {
      const useCase = new ListPendingConfirmationsUseCase(settlements);
      const result = await useCase.execute({
        groupId: GROUP_ID,
        pagination: { limit: 10 },
      });
      expect(result.items).toEqual([]);
    });
  });

  // ── ListDisputedSettlementsUseCase ───────────────────────

  describe('ListDisputedSettlementsUseCase', () => {
    it('lists disputed settlements for the group', async () => {
      const id1 = await makePending(settlements, audit, 's-1');
      const id2 = await makePending(settlements, audit, 's-2');
      const disputeUseCase = new DisputeSettlementUseCase(settlements, audit);
      await disputeUseCase.execute({
        settlementId: id1,
        expectedVersion: 2,
        reason: 'not_received',
      });
      await disputeUseCase.execute({
        settlementId: id2,
        expectedVersion: 2,
        reason: 'wrong_amount',
      });
      const listUseCase = new ListDisputedSettlementsUseCase(settlements);
      const result = await listUseCase.execute({
        groupId: GROUP_ID,
        pagination: { limit: 10 },
      });
      expect(result.items).toHaveLength(2);
      for (const s of result.items) {
        expect(s.status).toBe('disputed');
      }
    });
  });

  // ── Full dispute lifecycle ───────────────────────────────

  describe('full dispute lifecycle', () => {
    it('pending → disputed → completed (payment accepted after dispute)', async () => {
      const id = await makePending(settlements, audit);
      const dispute = new DisputeSettlementUseCase(settlements, audit);
      const resolve = new ResolveDisputeUseCase(settlements, audit);

      const disputed = await dispute.execute({
        settlementId: id,
        expectedVersion: 2,
        reason: 'wrong_amount',
        note: 'I see £40 not £42',
        actorId: USER_ID,
        actorMemberId: TO_MEMBER,
      });
      expect(disputed.settlement.status).toBe('disputed');

      const resolved = await resolve.execute({
        settlementId: id,
        expectedVersion: 3,
        resolution: 'completed',
        confirmedByMemberId: TO_MEMBER,
        note: 'Checked my bank — it was indeed £42',
        actorId: USER_ID,
      });
      expect(resolved.settlement.status).toBe('completed');
      expect(resolved.settlement.confirmedByMemberId).toBe(TO_MEMBER);

      // State history: draft→pending_confirmation (from record via makePending),
      // pending_confirmation→disputed (from dispute),
      // disputed→completed (from resolve) = 3 entries.
      const history = settlements.stateHistoryFor(id);
      expect(history).toHaveLength(3);
      expect(history[0]?.toStatus).toBe('pending_confirmation');
      expect(history[1]?.toStatus).toBe('disputed');
      expect(history[2]?.toStatus).toBe('completed');
    });

    it('pending → disputed → cancelled (payment rejected)', async () => {
      const id = await makePending(settlements, audit);
      const dispute = new DisputeSettlementUseCase(settlements, audit);
      const resolve = new ResolveDisputeUseCase(settlements, audit);

      await dispute.execute({
        settlementId: id,
        expectedVersion: 2,
        reason: 'not_received',
        actorId: USER_ID,
      });
      const resolved = await resolve.execute({
        settlementId: id,
        expectedVersion: 3,
        resolution: 'cancelled',
        actorId: USER_ID,
      });
      expect(resolved.settlement.status).toBe('cancelled');
    });
  });
});
