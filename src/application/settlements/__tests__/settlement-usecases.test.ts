import { beforeEach, describe, expect, it } from '@jest/globals';

import {
  asGroupId,
  asMemberId,
  asSettlementId,
  asUserId,
  createSettlement,
} from '@domain/entities/index';
import {
  InvalidEntityError,
  InvalidStateTransitionError,
  DeletedEntityError,
  VersionConflictError,
} from '@domain/errors/index';
import { asDateTime } from '@domain/value-objects';

import {
  CancelSettlementUseCase,
  ConfirmSettlementUseCase,
  CreateSettlementDraftUseCase,
  DeleteSettlementUseCase,
  GetSettlementUseCase,
  ListSettlementsUseCase,
  RecordSettlementUseCase,
  RejectSettlementUseCase,
  RequestSettlementUseCase,
  RestoreSettlementUseCase,
  ReverseSettlementUseCase,
  RetrySettlementAsDraftUseCase,
} from '../index';

import {
  InMemorySettlementRepository,
  InMemoryAuditRepository,
  InMemoryGroupMemberRepository,
} from './_in-memory-repositories';

// ── Fixtures ─────────────────────────────────────────────────────
const NOW = asDateTime('2026-10-10T10:00:00.000Z');
const LATER = asDateTime('2026-10-11T10:00:00.000Z');
const USER_ID = asUserId('user-1');
const GROUP_ID = asGroupId('group-1');
const FROM_MEMBER = asMemberId('m-1');
const TO_MEMBER = asMemberId('m-2');

// ── Shared setup ─────────────────────────────────────────────────
function setup() {
  const settlements = new InMemorySettlementRepository();
  const audit = new InMemoryAuditRepository();
  const members = new InMemoryGroupMemberRepository();
  // Default group membership for the fixtures (FROM_MEMBER / TO_MEMBER
  // in GROUP_ID) — individual tests can seed additional groups.
  members.seedActive(GROUP_ID as string, FROM_MEMBER as string);
  members.seedActive(GROUP_ID as string, TO_MEMBER as string);
  return { settlements, audit, members };
}

/**
 * Helper: create a draft settlement directly via the entity factory
 * (bypassing the use case) so we can test the transition use cases
 * in isolation.
 */
function seedDraft(settlements: InMemorySettlementRepository, id = 's-1') {
  const s = createSettlement({
    id: asSettlementId(id),
    groupId: GROUP_ID,
    fromMemberId: FROM_MEMBER,
    toMemberId: TO_MEMBER,
    amountMinor: 500,
    currencyCode: 'INR',
    method: 'upi',
    createdBy: USER_ID,
    now: NOW,
    status: 'draft',
  });
  settlements.seed(s);
  return s;
}

// ── Tests ────────────────────────────────────────────────────────

describe('Phase 6 Track 1 — Prompt 52 use cases', () => {
  let settlements: InMemorySettlementRepository;
  let audit: InMemoryAuditRepository;
  let members: InMemoryGroupMemberRepository;

  beforeEach(() => {
    ({ settlements, audit, members } = setup());
  });

  // ── CreateSettlementDraftUseCase ─────────────────────────────

  describe('CreateSettlementDraftUseCase', () => {
    it('creates a draft settlement with status=draft', async () => {
      const useCase = new CreateSettlementDraftUseCase(settlements, audit, members);
      const result = await useCase.execute({
        groupId: GROUP_ID as string,
        fromMemberId: FROM_MEMBER as string,
        toMemberId: TO_MEMBER as string,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ID as string,
      });
      expect(result.created).toBe(true);
      expect(result.status).toBe('draft');
      const saved = await settlements.findById(result.settlementId);
      expect(saved?.status).toBe('draft');
      expect(saved?.amountMinor).toBe(500);
    });

    // ── Group-level access control (Phase 7) ────────────────────

    it('rejects a payer who is not an active member of the group', async () => {
      const useCase = new CreateSettlementDraftUseCase(settlements, audit, members);
      await expect(
        useCase.execute({
          groupId: GROUP_ID as string,
          fromMemberId: 'm-outside-group',
          toMemberId: TO_MEMBER as string,
          amountMinor: 500,
          currencyCode: 'INR',
          method: 'upi',
          createdBy: USER_ID as string,
        }),
      ).rejects.toThrow('not an active member of group');
      // Nothing was persisted.
      const after = await settlements.listByGroup(GROUP_ID, { limit: 10 });
      expect(after.items).toEqual([]);
    });

    it('rejects a receiver who is not an active member of the group', async () => {
      const useCase = new CreateSettlementDraftUseCase(settlements, audit, members);
      await expect(
        useCase.execute({
          groupId: GROUP_ID as string,
          fromMemberId: FROM_MEMBER as string,
          toMemberId: 'm-outside-group',
          amountMinor: 500,
          currencyCode: 'INR',
          method: 'upi',
          createdBy: USER_ID as string,
        }),
      ).rejects.toThrow('not an active member of group');
    });

    it('rejects members that belong to a DIFFERENT group (cross-group corruption)', async () => {
      // Seed a member of another group with a colliding member id space.
      const otherGroup = 'group-other';
      const otherMember = 'm-other-group-member';
      members.seedActive(otherGroup, otherMember);
      const useCase = new CreateSettlementDraftUseCase(settlements, audit, members);
      await expect(
        useCase.execute({
          groupId: GROUP_ID as string,
          fromMemberId: otherMember, // active — but in group-other, not group-1
          toMemberId: TO_MEMBER as string,
          amountMinor: 500,
          currencyCode: 'INR',
          method: 'upi',
          createdBy: USER_ID as string,
        }),
      ).rejects.toThrow('not an active member of group');
    });

    it('rejects when the group has no active members at all', async () => {
      const useCase = new CreateSettlementDraftUseCase(settlements, audit, members);
      await expect(
        useCase.execute({
          groupId: 'group-empty',
          fromMemberId: FROM_MEMBER as string,
          toMemberId: TO_MEMBER as string,
          amountMinor: 500,
          currencyCode: 'INR',
          method: 'upi',
          createdBy: USER_ID as string,
        }),
      ).rejects.toThrow('has no active members');
    });

    it('runs the membership check BEFORE the idempotency probe (no existence oracle)', async () => {
      // An operationId that DOES exist (from a prior legit call) must not
      // be revealed to a caller passing a non-member payer.
      const useCase = new CreateSettlementDraftUseCase(settlements, audit, members);
      const first = await useCase.execute({
        groupId: GROUP_ID as string,
        fromMemberId: FROM_MEMBER as string,
        toMemberId: TO_MEMBER as string,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ID as string,
        operationId: 'op-secret',
      });
      expect(first.created).toBe(true);

      await expect(
        useCase.execute({
          groupId: GROUP_ID as string,
          fromMemberId: 'm-outside-group',
          toMemberId: TO_MEMBER as string,
          amountMinor: 999,
          currencyCode: 'INR',
          method: 'upi',
          createdBy: USER_ID as string,
          operationId: 'op-secret',
        }),
      ).rejects.toThrow('not an active member of group');
    });

    it('records an audit log entry on create', async () => {
      const useCase = new CreateSettlementDraftUseCase(settlements, audit, members);
      await useCase.execute({
        groupId: GROUP_ID as string,
        fromMemberId: FROM_MEMBER as string,
        toMemberId: TO_MEMBER as string,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ID as string,
      });
      expect(audit.entries).toHaveLength(1);
      expect(audit.entries[0]?.action).toBe('create');
      expect(audit.entries[0]?.entityType).toBe('settlement');
    });

    it('is idempotent on operationId — a retry returns the existing draft', async () => {
      const useCase = new CreateSettlementDraftUseCase(settlements, audit, members);
      const opId = 'op-uuid-1';
      const r1 = await useCase.execute({
        groupId: GROUP_ID as string,
        fromMemberId: FROM_MEMBER as string,
        toMemberId: TO_MEMBER as string,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ID as string,
        operationId: opId,
      });
      const r2 = await useCase.execute({
        groupId: GROUP_ID as string,
        fromMemberId: FROM_MEMBER as string,
        toMemberId: TO_MEMBER as string,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ID as string,
        operationId: opId,
      });
      expect(r1.created).toBe(true);
      expect(r2.created).toBe(false);
      expect(r1.settlementId).toBe(r2.settlementId);
      expect(settlements.allSettlements()).toHaveLength(1);
    });

    it('rejects a duplicate paymentReferenceHash', async () => {
      const useCase = new CreateSettlementDraftUseCase(settlements, audit, members);
      const hash = 'a'.repeat(64);
      await useCase.execute({
        groupId: GROUP_ID as string,
        fromMemberId: FROM_MEMBER as string,
        toMemberId: TO_MEMBER as string,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ID as string,
        paymentReferenceHash: hash,
      });
      await expect(
        useCase.execute({
          groupId: GROUP_ID as string,
          fromMemberId: FROM_MEMBER as string,
          toMemberId: TO_MEMBER as string,
          amountMinor: 500,
          currencyCode: 'INR',
          method: 'upi',
          createdBy: USER_ID as string,
          paymentReferenceHash: hash,
        }),
      ).rejects.toThrow(InvalidEntityError);
    });

    it('supports the new card method', async () => {
      const useCase = new CreateSettlementDraftUseCase(settlements, audit, members);
      const result = await useCase.execute({
        groupId: GROUP_ID as string,
        fromMemberId: FROM_MEMBER as string,
        toMemberId: TO_MEMBER as string,
        amountMinor: 500,
        currencyCode: 'USD',
        method: 'card',
        createdBy: USER_ID as string,
      });
      const saved = await settlements.findById(result.settlementId);
      expect(saved?.method).toBe('card');
    });

    it('supports the new wallet method', async () => {
      const useCase = new CreateSettlementDraftUseCase(settlements, audit, members);
      const result = await useCase.execute({
        groupId: GROUP_ID as string,
        fromMemberId: FROM_MEMBER as string,
        toMemberId: TO_MEMBER as string,
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'wallet',
        createdBy: USER_ID as string,
      });
      const saved = await settlements.findById(result.settlementId);
      expect(saved?.method).toBe('wallet');
    });
  });

  // ── RequestSettlementUseCase ─────────────────────────────────

  describe('RequestSettlementUseCase', () => {
    it('transitions draft → requested', async () => {
      const draft = seedDraft(settlements);
      const useCase = new RequestSettlementUseCase(settlements, audit);
      const result = await useCase.execute({
        settlementId: draft.id,
        expectedVersion: 1,
        actorId: USER_ID,
        actorMemberId: FROM_MEMBER,
        now: LATER,
      });
      expect(result.settlement.status).toBe('requested');
      expect(result.settlement.version).toBe(2);
    });

    it('appends a state-history entry', async () => {
      const draft = seedDraft(settlements);
      const useCase = new RequestSettlementUseCase(settlements, audit);
      await useCase.execute({
        settlementId: draft.id,
        expectedVersion: 1,
        actorId: USER_ID,
        now: LATER,
      });
      const history = settlements.stateHistoryFor(draft.id);
      expect(history).toHaveLength(1);
      expect(history[0]?.fromStatus).toBe('draft');
      expect(history[0]?.toStatus).toBe('requested');
      expect(history[0]?.newVersion).toBe(2);
    });

    it('throws VersionConflictError on stale version', async () => {
      const draft = seedDraft(settlements);
      const useCase = new RequestSettlementUseCase(settlements, audit);
      await expect(
        useCase.execute({
          settlementId: draft.id,
          expectedVersion: 99,
          actorId: USER_ID,
          now: LATER,
        }),
      ).rejects.toThrow(VersionConflictError);
    });

    it('throws InvalidStateTransitionError from completed', async () => {
      settlements.seed(
        createSettlement({
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
        }),
      );
      const useCase = new RequestSettlementUseCase(settlements, audit);
      await expect(
        useCase.execute({
          settlementId: asSettlementId('s-completed'),
          expectedVersion: 1,
          actorId: USER_ID,
          now: LATER,
        }),
      ).rejects.toThrow(InvalidStateTransitionError);
    });

    it('throws on not-found', async () => {
      const useCase = new RequestSettlementUseCase(settlements, audit);
      await expect(
        useCase.execute({
          settlementId: asSettlementId('nope'),
          expectedVersion: 1,
          actorId: USER_ID,
          now: LATER,
        }),
      ).rejects.toThrow(InvalidEntityError);
    });
  });

  // ── RecordSettlementUseCase ──────────────────────────────────

  describe('RecordSettlementUseCase', () => {
    it('transitions draft → pending_confirmation and attaches hashes', async () => {
      const draft = seedDraft(settlements);
      const useCase = new RecordSettlementUseCase(settlements, audit);
      const result = await useCase.execute({
        settlementId: draft.id,
        expectedVersion: 1,
        actorId: USER_ID,
        paymentReferenceHash: 'a'.repeat(64),
        evidenceHash: 'b'.repeat(64),
        now: LATER,
      });
      expect(result.settlement.status).toBe('pending_confirmation');
      expect(result.settlement.paymentReferenceHash).toBe('a'.repeat(64));
      expect(result.settlement.evidenceHash).toBe('b'.repeat(64));
    });

    it('does NOT mark the settlement as completed (safety)', async () => {
      const draft = seedDraft(settlements);
      const useCase = new RecordSettlementUseCase(settlements, audit);
      const result = await useCase.execute({
        settlementId: draft.id,
        expectedVersion: 1,
        actorId: USER_ID,
        now: LATER,
      });
      // The Phase 6 safety principle: recording a payment does not
      // imply completion. The receiver must confirm explicitly.
      expect(result.settlement.status).not.toBe('completed');
    });
  });

  // ── ConfirmSettlementUseCase ─────────────────────────────────

  describe('ConfirmSettlementUseCase', () => {
    it('transitions pending_confirmation → completed and records the confirmer', async () => {
      const draft = seedDraft(settlements);
      const recordUseCase = new RecordSettlementUseCase(settlements, audit);
      const pending = await recordUseCase.execute({
        settlementId: draft.id,
        expectedVersion: 1,
        actorId: USER_ID,
        now: LATER,
      });
      const confirmUseCase = new ConfirmSettlementUseCase(settlements, audit);
      const result = await confirmUseCase.execute({
        settlementId: pending.settlement.id,
        expectedVersion: 2,
        confirmedByMemberId: TO_MEMBER,
        actorId: USER_ID,
        now: LATER,
      });
      expect(result.settlement.status).toBe('completed');
      expect(result.settlement.confirmedByMemberId).toBe(TO_MEMBER);
      expect(result.settlement.confirmedAt).toBe(LATER);
    });

    it('throws InvalidStateTransitionError from cancelled (must record first)', async () => {
      // Confirming a cancelled settlement is forbidden — cancelled is terminal.
      // Build a cancelled settlement via the requested → cancelled path.
      const draft = seedDraft(settlements);
      const requestUseCase = new RequestSettlementUseCase(settlements, audit);
      const cancelUseCase = new CancelSettlementUseCase(settlements, audit);
      const requested = await requestUseCase.execute({
        settlementId: draft.id,
        expectedVersion: 1,
        actorId: USER_ID,
        now: LATER,
      });
      const cancelled = await cancelUseCase.execute({
        settlementId: requested.settlement.id,
        expectedVersion: 2,
        actorId: USER_ID,
        now: LATER,
      });
      const confirmUseCase = new ConfirmSettlementUseCase(settlements, audit);
      await expect(
        confirmUseCase.execute({
          settlementId: cancelled.settlement.id,
          expectedVersion: 3,
          confirmedByMemberId: TO_MEMBER,
          actorId: USER_ID,
          now: LATER,
        }),
      ).rejects.toThrow(InvalidStateTransitionError);
    });
  });

  // ── RejectSettlementUseCase ──────────────────────────────────

  describe('RejectSettlementUseCase', () => {
    it('transitions pending_confirmation → failed', async () => {
      const draft = seedDraft(settlements);
      const recordUseCase = new RecordSettlementUseCase(settlements, audit);
      const pending = await recordUseCase.execute({
        settlementId: draft.id,
        expectedVersion: 1,
        actorId: USER_ID,
        now: LATER,
      });
      const rejectUseCase = new RejectSettlementUseCase(settlements, audit);
      const result = await rejectUseCase.execute({
        settlementId: pending.settlement.id,
        expectedVersion: 2,
        actorId: USER_ID,
        reason: 'Wrong amount',
        now: LATER,
      });
      expect(result.settlement.status).toBe('failed');
    });
  });

  // ── CancelSettlementUseCase ──────────────────────────────────

  describe('CancelSettlementUseCase', () => {
    it('transitions requested → cancelled', async () => {
      const draft = seedDraft(settlements);
      const requestUseCase = new RequestSettlementUseCase(settlements, audit);
      const requested = await requestUseCase.execute({
        settlementId: draft.id,
        expectedVersion: 1,
        actorId: USER_ID,
        now: LATER,
      });
      const cancelUseCase = new CancelSettlementUseCase(settlements, audit);
      const result = await cancelUseCase.execute({
        settlementId: requested.settlement.id,
        expectedVersion: 2,
        actorId: USER_ID,
        now: LATER,
      });
      expect(result.settlement.status).toBe('cancelled');
    });

    it('transitions pending_confirmation → cancelled', async () => {
      const draft = seedDraft(settlements);
      const recordUseCase = new RecordSettlementUseCase(settlements, audit);
      const pending = await recordUseCase.execute({
        settlementId: draft.id,
        expectedVersion: 1,
        actorId: USER_ID,
        now: LATER,
      });
      const cancelUseCase = new CancelSettlementUseCase(settlements, audit);
      const result = await cancelUseCase.execute({
        settlementId: pending.settlement.id,
        expectedVersion: 2,
        actorId: USER_ID,
        now: LATER,
      });
      expect(result.settlement.status).toBe('cancelled');
    });
  });

  // ── RetrySettlementAsDraftUseCase ─────────────────────────────

  describe('RetrySettlementAsDraftUseCase', () => {
    it('transitions failed → draft', async () => {
      const draft = seedDraft(settlements);
      const recordUseCase = new RecordSettlementUseCase(settlements, audit);
      const rejectUseCase = new RejectSettlementUseCase(settlements, audit);
      const retryUseCase = new RetrySettlementAsDraftUseCase(settlements, audit);
      const pending = await recordUseCase.execute({
        settlementId: draft.id,
        expectedVersion: 1,
        actorId: USER_ID,
        now: LATER,
      });
      const failed = await rejectUseCase.execute({
        settlementId: pending.settlement.id,
        expectedVersion: 2,
        actorId: USER_ID,
        now: LATER,
      });
      const result = await retryUseCase.execute({
        settlementId: failed.settlement.id,
        expectedVersion: 3,
        actorId: USER_ID,
        now: LATER,
      });
      expect(result.settlement.status).toBe('draft');
    });
  });

  // ── ReverseSettlementUseCase ─────────────────────────────────

  describe('ReverseSettlementUseCase', () => {
    it('creates a reversal record and transitions completed → reversed', async () => {
      const draft = seedDraft(settlements);
      const recordUseCase = new RecordSettlementUseCase(settlements, audit);
      const confirmUseCase = new ConfirmSettlementUseCase(settlements, audit);
      const reverseUseCase = new ReverseSettlementUseCase(settlements, audit);

      const pending = await recordUseCase.execute({
        settlementId: draft.id,
        expectedVersion: 1,
        actorId: USER_ID,
        now: LATER,
      });
      const completed = await confirmUseCase.execute({
        settlementId: pending.settlement.id,
        expectedVersion: 2,
        confirmedByMemberId: TO_MEMBER,
        actorId: USER_ID,
        now: LATER,
      });
      const result = await reverseUseCase.execute({
        settlementId: completed.settlement.id,
        expectedVersion: 3,
        actorId: USER_ID,
        reason: 'Mistake',
        now: LATER,
      });
      expect(result.settlement.status).toBe('reversed');
      expect(result.settlement.reversesSettlementId).toBe(result.reversalId);
      expect(result.reversal.status).toBe('completed');
      expect(result.reversal.fromMemberId).toBe(TO_MEMBER); // swapped
      expect(result.reversal.toMemberId).toBe(FROM_MEMBER); // swapped
      expect(result.reversal.amountMinor).toBe(500);
    });

    it('throws when reversing a non-completed settlement', async () => {
      const draft = seedDraft(settlements);
      const reverseUseCase = new ReverseSettlementUseCase(settlements, audit);
      await expect(
        reverseUseCase.execute({
          settlementId: draft.id,
          expectedVersion: 1,
          actorId: USER_ID,
          now: LATER,
        }),
      ).rejects.toThrow(InvalidEntityError);
    });
  });

  // ── DeleteSettlementUseCase ───────────────────────────────────

  describe('DeleteSettlementUseCase', () => {
    it('soft-deletes a settlement and records an audit entry', async () => {
      const draft = seedDraft(settlements);
      const useCase = new DeleteSettlementUseCase(settlements, audit);
      await useCase.execute({
        settlementId: draft.id,
        expectedVersion: 1,
        actorId: USER_ID,
        now: LATER,
        reason: 'Test cleanup',
      });
      const deleted = await settlements.findById(draft.id);
      expect(deleted?.deletedAt).toBe(LATER);
      expect(deleted?.version).toBe(2);
      // status is preserved through soft-delete
      expect(deleted?.status).toBe('draft');
      // audit entry
      expect(audit.entries).toHaveLength(1);
      expect(audit.entries[0]?.action).toBe('delete');
    });

    it('is idempotent on already-deleted', async () => {
      const draft = seedDraft(settlements);
      const useCase = new DeleteSettlementUseCase(settlements, audit);
      await useCase.execute({
        settlementId: draft.id,
        expectedVersion: 1,
        actorId: USER_ID,
        now: LATER,
      });
      // Second call should not throw and should not create a second audit entry.
      await useCase.execute({
        settlementId: draft.id,
        expectedVersion: 2,
        actorId: USER_ID,
        now: LATER,
      });
      expect(audit.entries).toHaveLength(1);
    });

    it('throws on not-found', async () => {
      const useCase = new DeleteSettlementUseCase(settlements, audit);
      await expect(
        useCase.execute({
          settlementId: asSettlementId('nope'),
          expectedVersion: 1,
          actorId: USER_ID,
          now: LATER,
        }),
      ).rejects.toThrow(InvalidEntityError);
    });
  });

  // ── RestoreSettlementUseCase ─────────────────────────────────

  describe('RestoreSettlementUseCase', () => {
    it('restores a soft-deleted settlement preserving the original status', async () => {
      const draft = seedDraft(settlements);
      const deleteUseCase = new DeleteSettlementUseCase(settlements, audit);
      const restoreUseCase = new RestoreSettlementUseCase(settlements, audit);

      await deleteUseCase.execute({
        settlementId: draft.id,
        expectedVersion: 1,
        actorId: USER_ID,
        now: LATER,
      });
      const result = await restoreUseCase.execute({
        settlementId: draft.id,
        expectedVersion: 2,
        actorId: USER_ID,
        now: LATER,
      });
      expect(result.settlement.deletedAt).toBeUndefined();
      expect(result.settlement.status).toBe('draft');
      expect(result.settlement.version).toBe(3);
    });

    it('throws when restoring a non-deleted settlement', async () => {
      const draft = seedDraft(settlements);
      const useCase = new RestoreSettlementUseCase(settlements, audit);
      await expect(
        useCase.execute({
          settlementId: draft.id,
          expectedVersion: 1,
          actorId: USER_ID,
          now: LATER,
        }),
      ).rejects.toThrow(DeletedEntityError);
    });
  });

  // ── GetSettlementUseCase ─────────────────────────────────────

  describe('GetSettlementUseCase', () => {
    it('returns the settlement when found', async () => {
      const draft = seedDraft(settlements);
      const useCase = new GetSettlementUseCase(settlements);
      const result = await useCase.execute({ settlementId: draft.id });
      expect(result.settlement).not.toBeNull();
      expect(result.settlement?.id).toBe(draft.id);
    });

    it('returns null when not found', async () => {
      const useCase = new GetSettlementUseCase(settlements);
      const result = await useCase.execute({
        settlementId: asSettlementId('nope'),
      });
      expect(result.settlement).toBeNull();
    });

    it('returns null for soft-deleted settlements', async () => {
      const draft = seedDraft(settlements);
      const deleteUseCase = new DeleteSettlementUseCase(settlements, audit);
      await deleteUseCase.execute({
        settlementId: draft.id,
        expectedVersion: 1,
        actorId: USER_ID,
        now: LATER,
      });
      const getUseCase = new GetSettlementUseCase(settlements);
      const result = await getUseCase.execute({ settlementId: draft.id });
      expect(result.settlement).toBeNull();
    });
  });

  // ── ListSettlementsUseCase ───────────────────────────────────

  describe('ListSettlementsUseCase', () => {
    it('lists active settlements for a group', async () => {
      seedDraft(settlements, 's-1');
      seedDraft(settlements, 's-2');
      const useCase = new ListSettlementsUseCase(settlements);
      const result = await useCase.execute({
        groupId: GROUP_ID,
        pagination: { limit: 10 },
      });
      expect(result.items).toHaveLength(2);
    });

    it('filters by status', async () => {
      seedDraft(settlements, 's-draft');
      // Create a completed one
      settlements.seed(
        createSettlement({
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
        }),
      );
      const useCase = new ListSettlementsUseCase(settlements);
      const result = await useCase.execute({
        groupId: GROUP_ID,
        filter: { status: 'completed' },
        pagination: { limit: 10 },
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.status).toBe('completed');
    });

    it('filters by multiple statuses (OR)', async () => {
      seedDraft(settlements, 's-draft');
      settlements.seed(
        createSettlement({
          id: asSettlementId('s-compl'),
          groupId: GROUP_ID,
          fromMemberId: FROM_MEMBER,
          toMemberId: TO_MEMBER,
          amountMinor: 500,
          currencyCode: 'INR',
          method: 'upi',
          createdBy: USER_ID,
          now: NOW,
          status: 'completed',
        }),
      );
      const useCase = new ListSettlementsUseCase(settlements);
      const result = await useCase.execute({
        groupId: GROUP_ID,
        filter: { statuses: ['draft', 'completed'] },
        pagination: { limit: 10 },
      });
      expect(result.items).toHaveLength(2);
    });

    it('excludes soft-deleted settlements', async () => {
      const draft = seedDraft(settlements, 's-1');
      const deleteUseCase = new DeleteSettlementUseCase(settlements, audit);
      await deleteUseCase.execute({
        settlementId: draft.id,
        expectedVersion: 1,
        actorId: USER_ID,
        now: LATER,
      });
      const listUseCase = new ListSettlementsUseCase(settlements);
      const result = await listUseCase.execute({
        groupId: GROUP_ID,
        pagination: { limit: 10 },
      });
      expect(result.items).toHaveLength(0);
    });
  });

  // ── Full lifecycle smoke test ─────────────────────────────────

  describe('full lifecycle (Prompt 52 happy path)', () => {
    it('draft → requested → pending_confirmation → completed → reversed', async () => {
      const create = new CreateSettlementDraftUseCase(settlements, audit, members);
      const request = new RequestSettlementUseCase(settlements, audit);
      const record = new RecordSettlementUseCase(settlements, audit);
      const confirm = new ConfirmSettlementUseCase(settlements, audit);
      const reverse = new ReverseSettlementUseCase(settlements, audit);

      const r1 = await create.execute({
        groupId: GROUP_ID as string,
        fromMemberId: FROM_MEMBER as string,
        toMemberId: TO_MEMBER as string,
        amountMinor: 1000,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ID as string,
      });
      expect(r1.status).toBe('draft');

      const r2 = await request.execute({
        settlementId: r1.settlementId,
        expectedVersion: 1,
        actorId: USER_ID,
        now: LATER,
      });
      expect(r2.settlement.status).toBe('requested');

      const r3 = await record.execute({
        settlementId: r1.settlementId,
        expectedVersion: 2,
        actorId: USER_ID,
        now: LATER,
      });
      expect(r3.settlement.status).toBe('pending_confirmation');

      const r4 = await confirm.execute({
        settlementId: r1.settlementId,
        expectedVersion: 3,
        confirmedByMemberId: TO_MEMBER,
        actorId: USER_ID,
        now: LATER,
      });
      expect(r4.settlement.status).toBe('completed');
      expect(r4.settlement.confirmedByMemberId).toBe(TO_MEMBER);

      const r5 = await reverse.execute({
        settlementId: r1.settlementId,
        expectedVersion: 4,
        actorId: USER_ID,
        reason: 'Test reversal',
        now: LATER,
      });
      expect(r5.settlement.status).toBe('reversed');
      // Reversal record exists and cancels the original
      const reversal = await settlements.findById(r5.reversalId);
      expect(reversal?.status).toBe('completed');
      expect(reversal?.amountMinor).toBe(1000);

      // State history records all transitions
      const history = settlements.stateHistoryFor(r1.settlementId);
      // draft→requested, requested→pending_confirmation,
      // pending_confirmation→completed, completed→reversed = 4 entries
      expect(history).toHaveLength(4);
      expect(history[0]?.toStatus).toBe('requested');
      expect(history[1]?.toStatus).toBe('pending_confirmation');
      expect(history[2]?.toStatus).toBe('completed');
      expect(history[3]?.toStatus).toBe('reversed');
    });
  });
});
