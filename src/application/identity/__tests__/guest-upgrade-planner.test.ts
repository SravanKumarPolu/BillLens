import { describe, expect, it } from '@jest/globals';


import {
  asGroupId,
  asMemberId,
  asUserId,
  createExpense,
  createGroup,
  createGroupMember,
  createSettlement,
  type Expense,
  type Group,
  type GroupMember,
  type Receipt,
  type Settlement,
} from '@domain/entities';
import type { GuestIdentity } from '@domain/entities/guest-identity';
import { DeletedEntityError, InvalidEntityError, VersionConflictError } from '@domain/errors';
import { asDateTime } from '@domain/value-objects';
import type { GroupId, MemberId, UserId } from '@shared-types/index';

import { planGuestUpgrade, validatePlanStillValid, type GuestUpgradePlanInput } from '../guest-upgrade-planner';

const NOW = asDateTime('2026-07-29T10:00:00.000Z');
const GUEST_ID = 'guest-1' as never;
const CLOUD_USER_ID = asUserId('cloud-user-1');
const GROUP_ID = asGroupId('group-1');

function makeGuestIdentity(status: GuestIdentity['upgradeStatus']): GuestIdentity {
  return {
    id: GUEST_ID,
    displayName: 'Sravan' as never,
    deviceSecretHash: 'hash-abc',
    upgradeStatus: status,
    createdAt: NOW,
    updatedAt: NOW,
    version: 1 as never,
  };
}

function makeGroup(id: string, deleted = false): Group {
  const group = createGroup({
    id: asGroupId(id),
    name: `Group ${id}`,
    currencyCode: 'INR',
    createdBy: CLOUD_USER_ID,
    now: NOW,
  });
  return deleted ? { ...group, deletedAt: NOW } : group;
}

function makeExpense(id: string, groupId: GroupId, deleted = false): Expense {
  const expense = createExpense({
    id: `exp-${id}` as never,
    groupId,
    title: `Expense ${id}`,
    amountMinor: 1000,
    currencyCode: 'INR',
    expenseDate: NOW,
    splitType: 'equal',
    createdBy: CLOUD_USER_ID,
    now: NOW,
  });
  return deleted ? { ...expense, deletedAt: NOW } : expense;
}

function makeSettlement(id: string, fromMember: MemberId, toMember: MemberId): Settlement {
  return createSettlement({
    id: `s-${id}` as never,
    groupId: GROUP_ID,
    fromMemberId: fromMember,
    toMemberId: toMember,
    amountMinor: 500,
    currencyCode: 'INR',
    method: 'upi',
    createdBy: CLOUD_USER_ID,
    now: NOW,
  });
}

function makeMember(id: string, userId?: UserId, leftAt?: string): GroupMember {
  const member = createGroupMember({
    id: asMemberId(id),
    groupId: GROUP_ID,
    ...(userId !== undefined ? { userId } : {}),
    displayName: `Member ${id}`,
    role: 'member',
    now: NOW,
  });
  return leftAt !== undefined ? { ...member, leftAt: leftAt as never } : member;
}

/**
 * Base input with all new fields defaulted to empty arrays. Individual
 * tests can override specific fields without having to repeat the
 * empty-array boilerplate for the new fields.
 */
function makeBaseInput(overrides: Partial<GuestUpgradePlanInput> = {}): GuestUpgradePlanInput {
  return {
    guestIdentity: makeGuestIdentity('local_only'),
    targetUserId: CLOUD_USER_ID,
    localGroups: [],
    localExpenses: [],
    localPayers: [],
    localSplits: [],
    localSettlements: [],
    localReceipts: [],
    localReceiptItems: [],
    localMemberships: [],
    cloudMemberships: [],
    ...overrides,
  };
}

describe('planGuestUpgrade', () => {
  it('produces a plan for a local_only guest', () => {
    const input = makeBaseInput({
      guestIdentity: makeGuestIdentity('local_only'),
      localGroups: [makeGroup('g1'), makeGroup('g2')],
      localExpenses: [makeExpense('e1', asGroupId('g1'))],
      localMemberships: [makeMember('m1')],
    });
    const plan = planGuestUpgrade(input);

    expect(plan.guestIdentityId).toBe(GUEST_ID);
    expect(plan.targetUserId).toBe(CLOUD_USER_ID);
    expect(plan.groupsToUpload).toHaveLength(2);
    expect(plan.expensesToUpload).toHaveLength(1);
    expect(plan.payersToUpload).toHaveLength(0);
    expect(plan.splitsToUpload).toHaveLength(0);
    expect(plan.settlementsToUpload).toHaveLength(0);
    expect(plan.receiptsToUpload).toHaveLength(0);
    expect(plan.receiptItemsToUpload).toHaveLength(0);
    expect(plan.membershipsToReconcile).toHaveLength(1);
    expect(plan.duplicateMemberships).toHaveLength(0);
    expect(plan.requiresUserReview).toBe(false);
  });

  it('excludes soft-deleted entities from the plan', () => {
    const input = makeBaseInput({
      localGroups: [makeGroup('g1', true), makeGroup('g2', false)],
      localExpenses: [makeExpense('e1', asGroupId('g2'), true), makeExpense('e2', asGroupId('g2'), false)],
    });
    const plan = planGuestUpgrade(input);

    expect(plan.groupsToUpload).toHaveLength(1);
    expect(plan.groupsToUpload[0]?.id).toBe(asGroupId('g2'));
    expect(plan.expensesToUpload).toHaveLength(1);
  });

  it('detects duplicate memberships', () => {
    const localMember = makeMember('m-local', undefined);
    const cloudMember = makeMember('m-cloud', CLOUD_USER_ID);
    const input = makeBaseInput({
      localGroups: [makeGroup('g1')],
      localExpenses: [makeExpense('e1', GROUP_ID)],
      localSettlements: [
        makeSettlement('s1', localMember.id, asMemberId('other')),
        makeSettlement('s2', asMemberId('other'), localMember.id),
      ],
      localMemberships: [localMember],
      cloudMemberships: [cloudMember],
    });
    const plan = planGuestUpgrade(input);

    expect(plan.duplicateMemberships).toHaveLength(1);
    expect(plan.duplicateMemberships[0]?.localMember.id).toBe(localMember.id);
    expect(plan.duplicateMemberships[0]?.cloudMember.id).toBe(cloudMember.id);
    expect(plan.duplicateMemberships[0]?.affectedSettlementIds).toHaveLength(2);
    expect(plan.requiresUserReview).toBe(true);
  });

  it('requires user review when upgradeStatus is upgrade_failed', () => {
    const input = makeBaseInput({
      guestIdentity: makeGuestIdentity('upgrade_failed'),
    });
    const plan = planGuestUpgrade(input);
    expect(plan.requiresUserReview).toBe(true);
  });

  it('throws if guest is already upgraded', () => {
    expect(() =>
      planGuestUpgrade(
        makeBaseInput({
          guestIdentity: makeGuestIdentity('upgraded'),
        }),
      ),
    ).toThrow(DeletedEntityError);
  });

  it('throws if guest is in upgrade_in_progress status', () => {
    expect(() =>
      planGuestUpgrade(
        makeBaseInput({
          guestIdentity: makeGuestIdentity('upgrade_in_progress'),
        }),
      ),
    ).toThrow(InvalidEntityError);
  });

  it('filters payers and splits to only those belonging to active expenses', () => {
    // Active expense 'e1' has a payer and a split; deleted expense 'e2'
    // also has a payer and split, but they should be filtered out.
    const activeExpense = makeExpense('e1', GROUP_ID, false);
    const deletedExpense = makeExpense('e2', GROUP_ID, true);
    const activePayer = {
      id: 'payer-1' as never,
      expenseId: activeExpense.id,
      memberId: asMemberId('m1'),
      amountMinor: 600,
      createdAt: NOW,
      updatedAt: NOW,
      version: 1 as never,
    };
    const deletedPayer = {
      id: 'payer-2' as never,
      expenseId: deletedExpense.id,
      memberId: asMemberId('m1'),
      amountMinor: 400,
      createdAt: NOW,
      updatedAt: NOW,
      version: 1 as never,
    };
    const activeSplit = {
      id: 'split-1' as never,
      expenseId: activeExpense.id,
      memberId: asMemberId('m1'),
      amountMinor: 1000,
      createdAt: NOW,
      updatedAt: NOW,
      version: 1 as never,
    };
    const deletedSplit = {
      id: 'split-2' as never,
      expenseId: deletedExpense.id,
      memberId: asMemberId('m1'),
      amountMinor: 1000,
      createdAt: NOW,
      updatedAt: NOW,
      version: 1 as never,
    };
    const input = makeBaseInput({
      localExpenses: [activeExpense, deletedExpense],
      localPayers: [activePayer, deletedPayer],
      localSplits: [activeSplit, deletedSplit],
    });
    const plan = planGuestUpgrade(input);

    expect(plan.expensesToUpload).toHaveLength(1);
    expect(plan.expensesToUpload[0]?.id).toBe(activeExpense.id);
    expect(plan.payersToUpload).toHaveLength(1);
    expect(plan.payersToUpload[0]?.id).toBe('payer-1');
    expect(plan.splitsToUpload).toHaveLength(1);
    expect(plan.splitsToUpload[0]?.id).toBe('split-1');
  });

  it('filters receipt items to only those belonging to active receipts', () => {
    // Active receipt 'r1' has an item; deleted receipt 'r2' also has an
    // item, but it should be filtered out.
    const activeReceipt = {
      id: 'r1' as never,
      groupId: GROUP_ID,
      source: 'paper' as never,
      privacy: {
        storageMode: 'local_only' as never,
        retainRawText: false,
        retainSourceImage: true,
        retentionDays: 30,
      },
      uploadedBy: CLOUD_USER_ID,
      createdAt: NOW,
      updatedAt: NOW,
      version: 1 as never,
    };
    const deletedReceipt = { ...activeReceipt, id: 'r2' as never, deletedAt: NOW };
    const activeItem = {
      id: 'ri-1' as never,
      receiptId: activeReceipt.id,
      name: 'Item 1',
      quantity: 1,
      unitPriceMinor: 500,
      totalAmountMinor: 500,
      assignedMemberIds: [],
      createdAt: NOW,
      updatedAt: NOW,
      version: 1 as never,
    };
    const deletedItem = {
      ...activeItem,
      id: 'ri-2' as never,
      receiptId: deletedReceipt.id,
    };
    const input = makeBaseInput({
      localReceipts: [activeReceipt, deletedReceipt],
      localReceiptItems: [activeItem, deletedItem],
    });
    const plan = planGuestUpgrade(input);

    expect(plan.receiptsToUpload).toHaveLength(1);
    expect(plan.receiptsToUpload[0]?.id).toBe('r1');
    expect(plan.receiptItemsToUpload).toHaveLength(1);
    expect(plan.receiptItemsToUpload[0]?.id).toBe('ri-1');
  });

  /**
   * Helper: build a Receipt with a specific storageMode so we can exercise
   * the privacy-aware migration plan. Mirrors the shape produced by
   * `createReceipt` without invoking the factory (keeps the test focused
   * on the planner's privacy logic).
   */
  function makeReceiptWithPrivacy(
    id: string,
    storageMode:
      | 'local_only'
      | 'cloud_private'
      | 'shared_with_group'
      | 'delete_after_extraction',
  ): Receipt {
    return {
      id: id as never,
      groupId: GROUP_ID,
      source: 'paper' as never,
      privacy: {
        storageMode,
        retainRawText: false,
        retainSourceImage: true,
        retentionDays: 30,
      },
      uploadedBy: CLOUD_USER_ID,
      createdAt: NOW,
      updatedAt: NOW,
      version: 1 as never,
    };
  }

  it('receipt migration plan respects local_only preference', () => {
    const receipt = makeReceiptWithPrivacy('r-local', 'local_only');
    const plan = planGuestUpgrade(
      makeBaseInput({ localReceipts: [receipt] }),
    );

    expect(plan.receiptMigrationPlan).toHaveLength(1);
    const entry = plan.receiptMigrationPlan[0];
    expect(entry?.receiptId).toBe('r-local');
    expect(entry?.shouldUploadImage).toBe(false);
    expect(entry?.shouldUploadStructuredData).toBe(true);
    expect(entry?.reason).toBe('Local-only receipt; only structured data will sync');
  });

  it('receipt migration plan respects delete_after_extraction preference', () => {
    const receipt = makeReceiptWithPrivacy('r-del', 'delete_after_extraction');
    const plan = planGuestUpgrade(
      makeBaseInput({ localReceipts: [receipt] }),
    );

    expect(plan.receiptMigrationPlan).toHaveLength(1);
    const entry = plan.receiptMigrationPlan[0];
    expect(entry?.receiptId).toBe('r-del');
    expect(entry?.shouldUploadImage).toBe(false);
    expect(entry?.shouldUploadStructuredData).toBe(true);
    expect(entry?.reason).toBe(
      'Image deleted after extraction; only structured data will sync',
    );
  });

  it('receipt migration plan respects shared_with_group preference', () => {
    const receipt = makeReceiptWithPrivacy('r-shared', 'shared_with_group');
    const plan = planGuestUpgrade(
      makeBaseInput({ localReceipts: [receipt] }),
    );

    expect(plan.receiptMigrationPlan).toHaveLength(1);
    const entry = plan.receiptMigrationPlan[0];
    expect(entry?.receiptId).toBe('r-shared');
    expect(entry?.shouldUploadImage).toBe(true);
    expect(entry?.shouldUploadStructuredData).toBe(true);
    expect(entry?.reason).toBe('Image and structured data will sync');
  });

  it('receipt migration plan excludes soft-deleted receipts', () => {
    const activeReceipt = makeReceiptWithPrivacy('r-active', 'shared_with_group');
    const deletedReceipt: Receipt = {
      ...makeReceiptWithPrivacy('r-deleted', 'local_only'),
      deletedAt: NOW,
    };
    const plan = planGuestUpgrade(
      makeBaseInput({ localReceipts: [activeReceipt, deletedReceipt] }),
    );

    expect(plan.receiptMigrationPlan).toHaveLength(1);
    expect(plan.receiptMigrationPlan[0]?.receiptId).toBe('r-active');
  });
});

describe('validatePlanStillValid', () => {
  it('passes when version matches', () => {
    const plan = planGuestUpgrade(makeBaseInput());
    expect(() =>
      validatePlanStillValid(plan, makeGuestIdentity('local_only'), 1),
    ).not.toThrow();
  });

  it('throws VersionConflictError when version differs', () => {
    const plan = planGuestUpgrade(makeBaseInput());
    expect(() =>
      validatePlanStillValid(plan, { ...makeGuestIdentity('local_only'), version: 2 as never }, 1),
    ).toThrow(VersionConflictError);
  });

  it('throws InvalidEntityError when guest identity ID differs', () => {
    const plan = planGuestUpgrade(makeBaseInput());
    const differentGuest = { ...makeGuestIdentity('local_only'), id: 'other-guest' as never };
    expect(() => validatePlanStillValid(plan, differentGuest, 1)).toThrow(InvalidEntityError);
  });
});
