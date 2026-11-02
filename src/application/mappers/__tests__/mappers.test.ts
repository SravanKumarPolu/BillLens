import { describe, expect, it } from '@jest/globals';

import {
  asExpenseId,
  asExpensePayerId,
  asExpenseSplitId,
  asGroupId,
  asMemberId,
  asReceiptId,
  asSettlementId,
  asUserId,
  createExpense,
  createExpensePayer,
  createExpenseSplit,
  createGroup,
  createReceipt,
  createSettlement,
  createUser,
} from '@domain/entities';
import { asDateTime } from '@domain/value-objects';

import {
  ExpenseMapper,
  ExpensePayerMapper,
  ExpenseSplitMapper,
  GroupMapper,
  ReceiptMapper,
  SettlementMapper,
  UserMapper,
} from '../index';

describe('GroupMapper', () => {
  it('round-trips a Group entity through row and back', () => {
    const original = createGroup({
      id: asGroupId('group-1'),
      name: 'Goa Trip',
      description: 'Year-end vacation',
      currencyCode: 'INR',
      createdBy: asUserId('user-1'),
      now: asDateTime('2026-07-29T10:00:00.000Z'),
    });
    const row = GroupMapper.toRow(original);
    expect(row.id).toBe('group-1');
    expect(row.name).toBe('Goa Trip');
    expect(row.description).toBe('Year-end vacation');
    expect(row.currency_code).toBe('INR');
    expect(row.created_by).toBe('user-1');
    expect(row.deleted_at).toBeNull();

    const restored = GroupMapper.toEntity(row);
    expect(restored.id).toBe(original.id);
    expect(restored.name).toBe(original.name);
    expect(restored.description).toBe(original.description);
    expect(restored.currencyCode).toBe(original.currencyCode);
    expect(restored.createdBy).toBe(original.createdBy);
  });

  it('handles missing description', () => {
    const original = createGroup({
      id: asGroupId('group-1'),
      name: 'Test',
      currencyCode: 'INR',
      createdBy: asUserId('user-1'),
      now: asDateTime('2026-07-29T10:00:00.000Z'),
    });
    const row = GroupMapper.toRow(original);
    expect(row.description).toBeNull();
    const restored = GroupMapper.toEntity(row);
    expect(restored.description).toBeUndefined();
  });

  it('preserves soft-deleted state', () => {
    const original = createGroup({
      id: asGroupId('group-1'),
      name: 'Test',
      currencyCode: 'INR',
      createdBy: asUserId('user-1'),
      now: asDateTime('2026-07-29T10:00:00.000Z'),
    });
    const deleted = { ...original, deletedAt: asDateTime('2026-07-30T10:00:00.000Z') };
    const row = GroupMapper.toRow(deleted);
    expect(row.deleted_at).toBe('2026-07-30T10:00:00.000Z');
    const restored = GroupMapper.toEntity(row);
    expect(restored.deletedAt).toBe('2026-07-30T10:00:00.000Z');
  });
});

describe('SettlementMapper', () => {
  it('round-trips a Settlement entity', () => {
    const original = createSettlement({
      id: asSettlementId('s-1'),
      groupId: asGroupId('group-1'),
      fromMemberId: asMemberId('m-1'),
      toMemberId: asMemberId('m-2'),
      amountMinor: 500,
      currencyCode: 'INR',
      method: 'upi',
      createdBy: asUserId('user-1'),
      now: asDateTime('2026-07-29T10:00:00.000Z'),
    });
    const row = SettlementMapper.toRow(original);
    expect(row.from_member_id).toBe('m-1');
    expect(row.to_member_id).toBe('m-2');
    expect(row.amount_minor).toBe(500);
    expect(row.method).toBe('upi');

    const restored = SettlementMapper.toEntity(row);
    expect(restored.fromMemberId).toBe(original.fromMemberId);
    expect(restored.toMemberId).toBe(original.toMemberId);
    expect(restored.amountMinor).toBe(original.amountMinor);
    expect(restored.method).toBe(original.method);
  });

  it('preserves optional note', () => {
    const original = createSettlement({
      id: asSettlementId('s-1'),
      groupId: asGroupId('group-1'),
      fromMemberId: asMemberId('m-1'),
      toMemberId: asMemberId('m-2'),
      amountMinor: 500,
      currencyCode: 'INR',
      method: 'upi',
      note: 'Paid via GPay',
      createdBy: asUserId('user-1'),
      now: asDateTime('2026-07-29T10:00:00.000Z'),
    });
    const row = SettlementMapper.toRow(original);
    expect(row.note).toBe('Paid via GPay');
    const restored = SettlementMapper.toEntity(row);
    expect(restored.note).toBe('Paid via GPay');
  });

  it('handles missing note', () => {
    const original = createSettlement({
      id: asSettlementId('s-1'),
      groupId: asGroupId('group-1'),
      fromMemberId: asMemberId('m-1'),
      toMemberId: asMemberId('m-2'),
      amountMinor: 500,
      currencyCode: 'INR',
      method: 'upi',
      createdBy: asUserId('user-1'),
      now: asDateTime('2026-07-29T10:00:00.000Z'),
    });
    const row = SettlementMapper.toRow(original);
    expect(row.note).toBeNull();
    const restored = SettlementMapper.toEntity(row);
    expect(restored.note).toBeUndefined();
  });
});

describe('UserMapper', () => {
  it('round-trips a User entity through row and back', () => {
    const original = createUser({
      id: asUserId('user-1'),
      displayName: 'Sravan',
      email: 'Sravan@example.com',
      avatarUrl: 'https://example.com/avatar.png',
      now: asDateTime('2026-07-29T10:00:00.000Z'),
    });
    const row = UserMapper.toRow(original);
    expect(row.id).toBe('user-1');
    expect(row.display_name).toBe('Sravan');
    // EmailAddress value object lowercases on construction; row stores the
    // already-normalised entity value.
    expect(row.email).toBe('sravan@example.com');
    expect(row.avatar_url).toBe('https://example.com/avatar.png');
    expect(row.deleted_at).toBeNull();
    expect(row.version).toBe(1);

    const restored = UserMapper.toEntity(row);
    expect(restored.id).toBe(original.id);
    expect(restored.displayName).toBe(original.displayName);
    expect(restored.email).toBe(original.email);
    expect(restored.avatarUrl).toBe(original.avatarUrl);
    expect(restored.createdAt).toBe(original.createdAt);
    expect(restored.updatedAt).toBe(original.updatedAt);
    expect(restored.version).toBe(original.version);
    expect(restored.deletedAt).toBeUndefined();
  });

  it('preserves soft-deleted state', () => {
    const original = createUser({
      id: asUserId('user-1'),
      displayName: 'Sravan',
      email: 'sravan@example.com',
      now: asDateTime('2026-07-29T10:00:00.000Z'),
    });
    const deleted = { ...original, deletedAt: asDateTime('2026-07-30T10:00:00.000Z') };
    const row = UserMapper.toRow(deleted);
    expect(row.deleted_at).toBe('2026-07-30T10:00:00.000Z');
    const restored = UserMapper.toEntity(row);
    expect(restored.deletedAt).toBe('2026-07-30T10:00:00.000Z');
  });
});

describe('ExpenseMapper', () => {
  it('round-trips an Expense entity through row and back', () => {
    const original = createExpense({
      id: asExpenseId('exp-1'),
      groupId: asGroupId('group-1'),
      title: 'Dinner at Paradise',
      amountMinor: 125050,
      currencyCode: 'INR',
      expenseDate: '2026-07-29T10:00:00.000Z',
      splitType: 'equal',
      note: 'Team outing',
      category: 'Food',
      createdBy: asUserId('user-1'),
      now: asDateTime('2026-07-29T10:00:00.000Z'),
    });
    const row = ExpenseMapper.toRow(original);
    expect(row.id).toBe('exp-1');
    expect(row.title).toBe('Dinner at Paradise');
    expect(row.amount_minor).toBe(125050);
    expect(row.currency_code).toBe('INR');
    expect(row.split_type).toBe('equal');
    expect(row.note).toBe('Team outing');
    expect(row.category).toBe('Food');
    expect(row.deleted_at).toBeNull();
    expect(row.receipt_id).toBeNull();

    const restored = ExpenseMapper.toEntity(row);
    expect(restored.id).toBe(original.id);
    expect(restored.groupId).toBe(original.groupId);
    expect(restored.title).toBe(original.title);
    expect(restored.amountMinor).toBe(original.amountMinor);
    expect(restored.currencyCode).toBe(original.currencyCode);
    expect(restored.expenseDate).toBe(original.expenseDate);
    expect(restored.splitType).toBe(original.splitType);
    expect(restored.note).toBe(original.note);
    expect(restored.category).toBe(original.category);
    expect(restored.createdBy).toBe(original.createdBy);
    expect(restored.version).toBe(original.version);
  });

  it('round-trips an Expense with receiptId and soft-deleted state', () => {
    const original = {
      ...createExpense({
        id: asExpenseId('exp-1'),
        groupId: asGroupId('group-1'),
        title: 'Lunch',
        amountMinor: 500,
        currencyCode: 'INR',
        expenseDate: '2026-07-29T10:00:00.000Z',
        splitType: 'equal',
        receiptId: 'r-1',
        createdBy: asUserId('user-1'),
        now: asDateTime('2026-07-29T10:00:00.000Z'),
      }),
      deletedAt: asDateTime('2026-07-30T10:00:00.000Z'),
    };
    const row = ExpenseMapper.toRow(original);
    expect(row.receipt_id).toBe('r-1');
    expect(row.deleted_at).toBe('2026-07-30T10:00:00.000Z');
    const restored = ExpenseMapper.toEntity(row);
    expect(restored.receiptId).toBe(asReceiptId('r-1'));
    expect(restored.deletedAt).toBe('2026-07-30T10:00:00.000Z');
  });
});

describe('ExpensePayerMapper', () => {
  it('round-trips an ExpensePayer entity through row and back', () => {
    const original = createExpensePayer({
      id: asExpensePayerId('p-1'),
      expenseId: asExpenseId('exp-1'),
      memberId: asMemberId('m-1'),
      amountMinor: 125050,
      now: asDateTime('2026-07-29T10:00:00.000Z'),
    });
    const row = ExpensePayerMapper.toRow(original);
    expect(row.id).toBe('p-1');
    expect(row.expense_id).toBe('exp-1');
    expect(row.member_id).toBe('m-1');
    expect(row.amount_minor).toBe(125050);

    const restored = ExpensePayerMapper.toEntity(row);
    expect(restored.id).toBe(original.id);
    expect(restored.expenseId).toBe(original.expenseId);
    expect(restored.memberId).toBe(original.memberId);
    expect(restored.amountMinor).toBe(original.amountMinor);
    expect(restored.createdAt).toBe(original.createdAt);
    expect(restored.version).toBe(original.version);
  });
});

describe('ExpenseSplitMapper', () => {
  it('round-trips an ExpenseSplit with percentageBasisPoints and shareUnits', () => {
    const original = createExpenseSplit({
      id: asExpenseSplitId('split-1'),
      expenseId: asExpenseId('exp-1'),
      memberId: asMemberId('m-1'),
      amountMinor: 6000,
      percentageBasisPoints: 6000,
      shareUnits: 3,
      now: asDateTime('2026-07-29T10:00:00.000Z'),
    });
    const row = ExpenseSplitMapper.toRow(original);
    expect(row.id).toBe('split-1');
    expect(row.expense_id).toBe('exp-1');
    expect(row.member_id).toBe('m-1');
    expect(row.amount_minor).toBe(6000);
    expect(row.percentage_basis_points).toBe(6000);
    expect(row.share_units).toBe(3);

    const restored = ExpenseSplitMapper.toEntity(row);
    expect(restored.id).toBe(original.id);
    expect(restored.expenseId).toBe(original.expenseId);
    expect(restored.memberId).toBe(original.memberId);
    expect(restored.amountMinor).toBe(original.amountMinor);
    expect(restored.percentageBasisPoints).toBe(original.percentageBasisPoints);
    expect(restored.shareUnits).toBe(original.shareUnits);
    expect(restored.createdAt).toBe(original.createdAt);
    expect(restored.version).toBe(original.version);
  });

  it('round-trips an ExpenseSplit without percentage or share units', () => {
    const original = createExpenseSplit({
      id: asExpenseSplitId('split-1'),
      expenseId: asExpenseId('exp-1'),
      memberId: asMemberId('m-1'),
      amountMinor: 500,
      now: asDateTime('2026-07-29T10:00:00.000Z'),
    });
    const row = ExpenseSplitMapper.toRow(original);
    expect(row.percentage_basis_points).toBeNull();
    expect(row.share_units).toBeNull();
    const restored = ExpenseSplitMapper.toEntity(row);
    expect(restored.percentageBasisPoints).toBeUndefined();
    expect(restored.shareUnits).toBeUndefined();
  });
});

describe('ReceiptMapper', () => {
  it('round-trips a Receipt with privacy preferences', () => {
    const original = createReceipt({
      id: asReceiptId('r-1'),
      groupId: asGroupId('group-1'),
      source: 'paper',
      merchantName: 'Big Bazaar',
      currencyCode: 'INR',
      totalAmountMinor: 1500,
      subtotalAmountMinor: 1400,
      taxAmountMinor: 100,
      receiptDate: '2026-07-29T10:00:00.000Z',
      imageUri: 'file:///receipt.png',
      imageHash: 'sha256:abc',
      privacy: {
        storageMode: 'cloud_private',
        retainRawText: true,
        retainSourceImage: false,
        retentionDays: 14,
      },
      uploadedBy: asUserId('user-1'),
      now: asDateTime('2026-07-29T10:00:00.000Z'),
    });
    const row = ReceiptMapper.toRow(original);
    expect(row.id).toBe('r-1');
    expect(row.source).toBe('paper');
    expect(row.merchant_name).toBe('Big Bazaar');
    expect(row.currency_code).toBe('INR');
    expect(row.total_amount_minor).toBe(1500);
    expect(row.subtotal_amount_minor).toBe(1400);
    expect(row.tax_amount_minor).toBe(100);
    expect(row.receipt_date).toBe('2026-07-29T10:00:00.000Z');
    expect(row.image_uri).toBe('file:///receipt.png');
    expect(row.image_hash).toBe('sha256:abc');
    expect(row.storage_mode).toBe('cloud_private');
    expect(row.retain_raw_text).toBe(true);
    expect(row.retain_source_image).toBe(false);
    expect(row.retention_days).toBe(14);
    expect(row.deleted_at).toBeNull();

    const restored = ReceiptMapper.toEntity(row);
    expect(restored.id).toBe(original.id);
    expect(restored.groupId).toBe(original.groupId);
    expect(restored.source).toBe(original.source);
    expect(restored.merchantName).toBe(original.merchantName);
    expect(restored.currencyCode).toBe(original.currencyCode);
    expect(restored.totalAmountMinor).toBe(original.totalAmountMinor);
    expect(restored.subtotalAmountMinor).toBe(original.subtotalAmountMinor);
    expect(restored.taxAmountMinor).toBe(original.taxAmountMinor);
    expect(restored.receiptDate).toBe(original.receiptDate);
    expect(restored.imageUri).toBe(original.imageUri);
    expect(restored.imageHash).toBe(original.imageHash);
    expect(restored.privacy.storageMode).toBe(original.privacy.storageMode);
    expect(restored.privacy.retainRawText).toBe(original.privacy.retainRawText);
    expect(restored.privacy.retainSourceImage).toBe(original.privacy.retainSourceImage);
    expect(restored.privacy.retentionDays).toBe(original.privacy.retentionDays);
    expect(restored.uploadedBy).toBe(original.uploadedBy);
    expect(restored.version).toBe(original.version);
  });
});
