import { describe, expect, it } from '@jest/globals';

import {
  type MemberId,
  type UserId,
  asExpenseId,
  asExpensePayerId,
  asExpenseSplitId,
  asGroupId,
  asMemberId,
  asReceiptId,
  asReceiptItemId,
  asUserId,
  createExpense,
  createExpensePayer,
  createExpenseSplit,
  createGroup,
  createGroupMember,
  createReceiptItem,
  leaveGroup,
  softDeleteExpensePayer,
  softDeleteExpenseSplit,
  softDeleteGroup,
  softDeleteReceiptItem,
  wasMemberActiveAt,
  validateNoDuplicateMembers,
  validatePayerTotal,
  validatePercentageTotal,
  validateSplitTotal,
} from '../../entities/index';
import {
  DeletedEntityError,
  EmptyValueError,
  InvalidEntityError,
  InvalidSplitError,
  PayerTotalMismatchError,
  ValueTooLongError,
  VersionConflictError,
} from '../../errors/index';
import { asDateTime } from '../../value-objects/index';

const NOW = asDateTime('2026-07-29T10:00:00.000Z');
const USER_ID = asUserId('user-1');
const GROUP_ID = asGroupId('group-1');
const EXPENSE_ID = asExpenseId('exp-1');

describe('Group entity', () => {
  it('creates a valid group', () => {
    const group = createGroup({
      id: GROUP_ID,
      name: 'Goa Trip',
      currencyCode: 'INR',
      createdBy: USER_ID,
      now: NOW,
    });
    expect(group.name).toBe('Goa Trip');
    expect(group.currencyCode).toBe('INR');
    expect(group.createdAt).toBe(NOW);
    expect(group.version).toBe(1);
    expect(group.deletedAt).toBeUndefined();
  });

  it('rejects empty name', () => {
    expect(() =>
      createGroup({
        id: GROUP_ID,
        name: '   ',
        currencyCode: 'INR',
        createdBy: USER_ID,
        now: NOW,
      }),
    ).toThrow(EmptyValueError);
  });

  it('rejects name >100 chars', () => {
    expect(() =>
      createGroup({
        id: GROUP_ID,
        name: 'a'.repeat(101),
        currencyCode: 'INR',
        createdBy: USER_ID,
        now: NOW,
      }),
    ).toThrow(ValueTooLongError);
  });

  it('rejects invalid currency code', () => {
    expect(() =>
      createGroup({
        id: GROUP_ID,
        name: 'Test',
        currencyCode: 'invalid',
        createdBy: USER_ID,
        now: NOW,
      }),
    ).toThrow();
  });

  it('trims name on creation', () => {
    const group = createGroup({
      id: GROUP_ID,
      name: '  Goa Trip  ',
      currencyCode: 'INR',
      createdBy: USER_ID,
      now: NOW,
    });
    expect(group.name).toBe('Goa Trip');
  });

  it('soft-deletes a group', () => {
    const group = createGroup({
      id: GROUP_ID,
      name: 'Goa Trip',
      currencyCode: 'INR',
      createdBy: USER_ID,
      now: NOW,
    });
    const deleted = softDeleteGroup(group, {
      now: asDateTime('2026-07-30T10:00:00.000Z'),
      expectedVersion: 1 as never,
    });
    expect(deleted.deletedAt).toBe('2026-07-30T10:00:00.000Z');
    expect(deleted.version).toBe(2);
  });
});

describe('GroupMember entity', () => {
  it('creates a valid member', () => {
    const member = createGroupMember({
      id: asMemberId('m-1'),
      groupId: GROUP_ID,
      displayName: 'Sravan',
      role: 'owner',
      now: NOW,
    });
    expect(member.displayName).toBe('Sravan');
    expect(member.role).toBe('owner');
  });

  it('rejects empty display name', () => {
    expect(() =>
      createGroupMember({
        id: asMemberId('m-1'),
        groupId: GROUP_ID,
        displayName: '',
        role: 'member',
        now: NOW,
      }),
    ).toThrow(EmptyValueError);
  });

  it('leaving sets leftAt', () => {
    const member = createGroupMember({
      id: asMemberId('m-1'),
      groupId: GROUP_ID,
      displayName: 'Sravan',
      role: 'owner',
      now: NOW,
    });
    const left = leaveGroup(member, {
      now: asDateTime('2026-08-01T10:00:00.000Z'),
      expectedVersion: 1 as never,
    });
    expect(left.leftAt).toBe('2026-08-01T10:00:00.000Z');
    expect(left.version).toBe(2);
  });

  it('cannot leave twice', () => {
    const member = createGroupMember({
      id: asMemberId('m-1'),
      groupId: GROUP_ID,
      displayName: 'Sravan',
      role: 'owner',
      now: NOW,
    });
    const left = leaveGroup(member, {
      now: asDateTime('2026-08-01T10:00:00.000Z'),
      expectedVersion: 1 as never,
    });
    expect(() =>
      leaveGroup(left, {
        now: asDateTime('2026-08-02T10:00:00.000Z'),
        expectedVersion: 2 as never,
      }),
    ).toThrow(DeletedEntityError);
  });

  it('wasMemberActiveAt respects joinedAt and leftAt', () => {
    const member = createGroupMember({
      id: asMemberId('m-1'),
      groupId: GROUP_ID,
      displayName: 'Sravan',
      role: 'owner',
      now: asDateTime('2026-07-01T00:00:00.000Z'),
    });
    expect(wasMemberActiveAt(member, asDateTime('2026-07-15T00:00:00.000Z'))).toBe(true);
    expect(wasMemberActiveAt(member, asDateTime('2026-06-15T00:00:00.000Z'))).toBe(false);
  });
});

describe('Expense entity', () => {
  it('creates a valid expense', () => {
    const expense = createExpense({
      id: EXPENSE_ID,
      groupId: GROUP_ID,
      title: 'Dinner at Paradise',
      amountMinor: 125050,
      currencyCode: 'INR',
      expenseDate: NOW,
      splitType: 'equal',
      createdBy: USER_ID,
      now: NOW,
    });
    expect(expense.title).toBe('Dinner at Paradise');
    expect(expense.amountMinor).toBe(125050);
    expect(expense.version).toBe(1);
  });

  it('rejects empty title', () => {
    expect(() =>
      createExpense({
        id: EXPENSE_ID,
        groupId: GROUP_ID,
        title: '',
        amountMinor: 125050,
        currencyCode: 'INR',
        expenseDate: NOW,
        splitType: 'equal',
        createdBy: USER_ID,
        now: NOW,
      }),
    ).toThrow(EmptyValueError);
  });

  it('rejects negative amount', () => {
    expect(() =>
      createExpense({
        id: EXPENSE_ID,
        groupId: GROUP_ID,
        title: 'Test',
        amountMinor: -100,
        currencyCode: 'INR',
        expenseDate: NOW,
        splitType: 'equal',
        createdBy: USER_ID,
        now: NOW,
      }),
    ).toThrow(InvalidEntityError);
  });

  it('rejects zero amount', () => {
    expect(() =>
      createExpense({
        id: EXPENSE_ID,
        groupId: GROUP_ID,
        title: 'Test',
        amountMinor: 0,
        currencyCode: 'INR',
        expenseDate: NOW,
        splitType: 'equal',
        createdBy: USER_ID,
        now: NOW,
      }),
    ).toThrow(InvalidEntityError);
  });

  it('rejects non-integer amount', () => {
    expect(() =>
      createExpense({
        id: EXPENSE_ID,
        groupId: GROUP_ID,
        title: 'Test',
        amountMinor: 100.5,
        currencyCode: 'INR',
        expenseDate: NOW,
        splitType: 'equal',
        createdBy: USER_ID,
        now: NOW,
      }),
    ).toThrow(InvalidEntityError);
  });
});

describe('validatePayerTotal', () => {
  it('passes when payer sum equals total', () => {
    expect(() => validatePayerTotal(1000, [600, 400])).not.toThrow();
  });

  it('throws on under-allocation', () => {
    expect(() => validatePayerTotal(1000, [500, 400])).toThrow(PayerTotalMismatchError);
  });

  it('throws on over-allocation', () => {
    expect(() => validatePayerTotal(1000, [600, 500])).toThrow(PayerTotalMismatchError);
  });
});

describe('ExpenseSplit validation', () => {
  it('creates a valid split', () => {
    const split = createExpenseSplit({
      id: asExpenseSplitId('split-1'),
      expenseId: EXPENSE_ID,
      memberId: asMemberId('m-1'),
      amountMinor: 500,
      now: NOW,
    });
    expect(split.amountMinor).toBe(500);
    expect(split.percentageBasisPoints).toBeUndefined();
    expect(split.shareUnits).toBeUndefined();
  });

  it('rejects negative split amount', () => {
    expect(() =>
      createExpenseSplit({
        id: asExpenseSplitId('split-1'),
        expenseId: EXPENSE_ID,
        memberId: asMemberId('m-1'),
        amountMinor: -100,
        now: NOW,
      }),
    ).toThrow(InvalidSplitError);
  });

  it('rejects percentageBasisPoints > 10000', () => {
    expect(() =>
      createExpenseSplit({
        id: asExpenseSplitId('split-1'),
        expenseId: EXPENSE_ID,
        memberId: asMemberId('m-1'),
        amountMinor: 1000,
        percentageBasisPoints: 10001,
        now: NOW,
      }),
    ).toThrow(InvalidSplitError);
  });

  it('rejects shareUnits <= 0', () => {
    expect(() =>
      createExpenseSplit({
        id: asExpenseSplitId('split-1'),
        expenseId: EXPENSE_ID,
        memberId: asMemberId('m-1'),
        amountMinor: 1000,
        shareUnits: 0,
        now: NOW,
      }),
    ).toThrow(InvalidSplitError);
  });

  it('validateSplitTotal passes when splits sum to total', () => {
    const splits = [
      createExpenseSplit({
        id: asExpenseSplitId('s1'),
        expenseId: EXPENSE_ID,
        memberId: asMemberId('m-1'),
        amountMinor: 600,
        now: NOW,
      }),
      createExpenseSplit({
        id: asExpenseSplitId('s2'),
        expenseId: EXPENSE_ID,
        memberId: asMemberId('m-2'),
        amountMinor: 400,
        now: NOW,
      }),
    ];
    expect(() => validateSplitTotal(1000, splits)).not.toThrow();
  });

  it('validateSplitTotal throws on mismatch', () => {
    const splits = [
      createExpenseSplit({
        id: asExpenseSplitId('s1'),
        expenseId: EXPENSE_ID,
        memberId: asMemberId('m-1'),
        amountMinor: 600,
        now: NOW,
      }),
    ];
    expect(() => validateSplitTotal(1000, splits)).toThrow(InvalidSplitError);
  });

  it('validatePercentageTotal passes when sum = 10000', () => {
    const splits = [
      createExpenseSplit({
        id: asExpenseSplitId('s1'),
        expenseId: EXPENSE_ID,
        memberId: asMemberId('m-1'),
        amountMinor: 600,
        percentageBasisPoints: 6000,
        now: NOW,
      }),
      createExpenseSplit({
        id: asExpenseSplitId('s2'),
        expenseId: EXPENSE_ID,
        memberId: asMemberId('m-2'),
        amountMinor: 400,
        percentageBasisPoints: 4000,
        now: NOW,
      }),
    ];
    expect(() => validatePercentageTotal(splits)).not.toThrow();
  });

  it('validatePercentageTotal throws when sum != 10000', () => {
    const splits = [
      createExpenseSplit({
        id: asExpenseSplitId('s1'),
        expenseId: EXPENSE_ID,
        memberId: asMemberId('m-1'),
        amountMinor: 600,
        percentageBasisPoints: 5000,
        now: NOW,
      }),
    ];
    expect(() => validatePercentageTotal(splits)).toThrow(InvalidSplitError);
  });

  it('validateNoDuplicateMembers passes for unique members', () => {
    const splits = [
      createExpenseSplit({
        id: asExpenseSplitId('s1'),
        expenseId: EXPENSE_ID,
        memberId: asMemberId('m-1'),
        amountMinor: 500,
        now: NOW,
      }),
      createExpenseSplit({
        id: asExpenseSplitId('s2'),
        expenseId: EXPENSE_ID,
        memberId: asMemberId('m-2'),
        amountMinor: 500,
        now: NOW,
      }),
    ];
    expect(() => validateNoDuplicateMembers(splits)).not.toThrow();
  });

  it('validateNoDuplicateMembers throws on duplicates', () => {
    const memberId = asMemberId('m-1') as MemberId;
    const splits = [
      createExpenseSplit({
        id: asExpenseSplitId('s1'),
        expenseId: EXPENSE_ID,
        memberId,
        amountMinor: 500,
        now: NOW,
      }),
      createExpenseSplit({
        id: asExpenseSplitId('s2'),
        expenseId: EXPENSE_ID,
        memberId,
        amountMinor: 500,
        now: NOW,
      }),
    ];
    expect(() => validateNoDuplicateMembers(splits)).toThrow(InvalidSplitError);
  });
});

// Type-only re-export to satisfy linter (no unused import)
export type { UserId };

describe('ExpensePayer soft-delete', () => {
  it('sets deletedAt and bumps version on soft-delete', () => {
    const payer = createExpensePayer({
      id: asExpensePayerId('p-1'),
      expenseId: EXPENSE_ID,
      memberId: asMemberId('m-1'),
      amountMinor: 500,
      now: NOW,
    });
    expect(payer.updatedAt).toBe(NOW);
    expect(payer.deletedAt).toBeUndefined();

    const deleted = softDeleteExpensePayer(payer, {
      now: asDateTime('2026-07-30T10:00:00.000Z'),
      expectedVersion: 1 as never,
    });
    expect(deleted.deletedAt).toBe('2026-07-30T10:00:00.000Z');
    expect(deleted.updatedAt).toBe('2026-07-30T10:00:00.000Z');
    expect(deleted.version).toBe(2);
    // Original is untouched (immutable).
    expect(payer.deletedAt).toBeUndefined();
  });

  it('throws VersionConflictError on stale expectedVersion', () => {
    const payer = createExpensePayer({
      id: asExpensePayerId('p-1'),
      expenseId: EXPENSE_ID,
      memberId: asMemberId('m-1'),
      amountMinor: 500,
      now: NOW,
    });
    expect(() =>
      softDeleteExpensePayer(payer, {
        now: NOW,
        expectedVersion: 5 as never,
      }),
    ).toThrow(VersionConflictError);
  });

  it('throws DeletedEntityError when soft-deleting an already-deleted payer', () => {
    const payer = createExpensePayer({
      id: asExpensePayerId('p-1'),
      expenseId: EXPENSE_ID,
      memberId: asMemberId('m-1'),
      amountMinor: 500,
      now: NOW,
    });
    const deleted = softDeleteExpensePayer(payer, {
      now: NOW,
      expectedVersion: 1 as never,
    });
    expect(() =>
      softDeleteExpensePayer(deleted, {
        now: NOW,
        expectedVersion: 2 as never,
      }),
    ).toThrow(DeletedEntityError);
  });
});

describe('ExpenseSplit soft-delete', () => {
  it('sets deletedAt and bumps version on soft-delete', () => {
    const split = createExpenseSplit({
      id: asExpenseSplitId('split-1'),
      expenseId: EXPENSE_ID,
      memberId: asMemberId('m-1'),
      amountMinor: 500,
      now: NOW,
    });
    expect(split.updatedAt).toBe(NOW);
    expect(split.deletedAt).toBeUndefined();

    const deleted = softDeleteExpenseSplit(split, {
      now: asDateTime('2026-07-30T10:00:00.000Z'),
      expectedVersion: 1 as never,
    });
    expect(deleted.deletedAt).toBe('2026-07-30T10:00:00.000Z');
    expect(deleted.updatedAt).toBe('2026-07-30T10:00:00.000Z');
    expect(deleted.version).toBe(2);
  });

  it('throws VersionConflictError on stale expectedVersion', () => {
    const split = createExpenseSplit({
      id: asExpenseSplitId('split-1'),
      expenseId: EXPENSE_ID,
      memberId: asMemberId('m-1'),
      amountMinor: 500,
      now: NOW,
    });
    expect(() =>
      softDeleteExpenseSplit(split, {
        now: NOW,
        expectedVersion: 99 as never,
      }),
    ).toThrow(VersionConflictError);
  });

  it('throws DeletedEntityError when soft-deleting an already-deleted split', () => {
    const split = createExpenseSplit({
      id: asExpenseSplitId('split-1'),
      expenseId: EXPENSE_ID,
      memberId: asMemberId('m-1'),
      amountMinor: 500,
      now: NOW,
    });
    const deleted = softDeleteExpenseSplit(split, {
      now: NOW,
      expectedVersion: 1 as never,
    });
    expect(() =>
      softDeleteExpenseSplit(deleted, {
        now: NOW,
        expectedVersion: 2 as never,
      }),
    ).toThrow(DeletedEntityError);
  });
});

describe('ReceiptItem soft-delete', () => {
  const RECEIPT_ID = asReceiptId('r-1');

  it('sets deletedAt and bumps version on soft-delete', () => {
    const item = createReceiptItem({
      id: asReceiptItemId('ri-1'),
      receiptId: RECEIPT_ID,
      name: 'Burger',
      quantity: 2,
      unitPriceMinor: 500,
      now: NOW,
    });
    expect(item.updatedAt).toBe(NOW);
    expect(item.deletedAt).toBeUndefined();

    const deleted = softDeleteReceiptItem(item, {
      now: asDateTime('2026-07-30T10:00:00.000Z'),
      expectedVersion: 1 as never,
    });
    expect(deleted.deletedAt).toBe('2026-07-30T10:00:00.000Z');
    expect(deleted.updatedAt).toBe('2026-07-30T10:00:00.000Z');
    expect(deleted.version).toBe(2);
  });

  it('throws VersionConflictError on stale expectedVersion', () => {
    const item = createReceiptItem({
      id: asReceiptItemId('ri-1'),
      receiptId: RECEIPT_ID,
      name: 'Burger',
      quantity: 2,
      unitPriceMinor: 500,
      now: NOW,
    });
    expect(() =>
      softDeleteReceiptItem(item, {
        now: NOW,
        expectedVersion: 7 as never,
      }),
    ).toThrow(VersionConflictError);
  });

  it('throws DeletedEntityError when soft-deleting an already-deleted item', () => {
    const item = createReceiptItem({
      id: asReceiptItemId('ri-1'),
      receiptId: RECEIPT_ID,
      name: 'Burger',
      quantity: 2,
      unitPriceMinor: 500,
      now: NOW,
    });
    const deleted = softDeleteReceiptItem(item, {
      now: NOW,
      expectedVersion: 1 as never,
    });
    expect(() =>
      softDeleteReceiptItem(deleted, {
        now: NOW,
        expectedVersion: 2 as never,
      }),
    ).toThrow(DeletedEntityError);
  });
});
