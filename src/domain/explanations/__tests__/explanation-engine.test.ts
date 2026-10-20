import { describe, expect, it } from '@jest/globals';

import {
  asExpenseId,
  asExpenseSplitId,
  asGroupId,
  asMemberId,
  asSettlementId,
  asUserId,
  createExpense,
  createExpenseSplit,
  createSettlement,
  softDeleteSettlement,
  type Expense,
  type ExpenseSplit,
  type Settlement,
} from '@domain/entities';
import {
  type BalanceExplanationEntry,
  type BalanceResult,
  type MemberBalance,
} from '@domain/services/balances';
import { asCurrencyCode, asDateTime } from '@domain/value-objects';
import type { MemberId } from '@shared-types/index';

import {
  buildRoundingExplanations,
  buildSettlementExplanations,
  explainMemberBalance,
} from '../index';

const NOW = asDateTime('2026-07-29T10:00:00.000Z');
const CURRENCY = asCurrencyCode('INR');
const USER_ID = asUserId('user-1');
const GROUP_ID = asGroupId('group-1');

const A: MemberId = asMemberId('a');
const B: MemberId = asMemberId('b');
const C: MemberId = asMemberId('c');

function emptyBalanceResult(): BalanceResult {
  return {
    groupId: GROUP_ID as string,
    currency: CURRENCY,
    memberBalances: [],
    suggestedTransfers: [],
    explanations: new Map<string, readonly BalanceExplanationEntry[]>(),
    isBalanced: true,
    validationStatus: 'balanced',
    diagnostics: [],
  };
}

function balanceFor(
  memberId: MemberId,
  paid: number,
  share: number,
  sent: number,
  received: number,
): MemberBalance {
  return {
    memberId,
    paidMinor: paid,
    shareMinor: share,
    settlementsSentMinor: sent,
    settlementsReceivedMinor: received,
    netBalanceMinor: paid - share - received + sent,
  };
}

describe('explainMemberBalance', () => {
  it('creditor case produces a "Should receive" summary', () => {
    const balance = balanceFor(A, 1200, 300, 0, 0);
    const result = explainMemberBalance(A, balance, emptyBalanceResult(), CURRENCY);

    expect(result.summaryKey).toBe('creditor');
    expect(result.summaryText).toContain('Should receive');
    expect(result.summaryText).toContain('INR 9.00');
    expect(result.netBalanceMinor).toBe(900);
  });

  it('debtor case produces an "Owes" summary', () => {
    const balance = balanceFor(B, 0, 500, 0, 0);
    const result = explainMemberBalance(B, balance, emptyBalanceResult(), CURRENCY);

    expect(result.summaryKey).toBe('debtor');
    expect(result.summaryText).toContain('Owes');
    expect(result.summaryText).toContain('INR 5.00');
    expect(result.netBalanceMinor).toBe(-500);
  });

  it('settled case produces a "Settled" summary', () => {
    const balance = balanceFor(C, 300, 300, 0, 0);
    const result = explainMemberBalance(C, balance, emptyBalanceResult(), CURRENCY);

    expect(result.summaryKey).toBe('settled');
    expect(result.summaryText).toContain('Settled');
    expect(result.netBalanceMinor).toBe(0);
  });

  it('maps expense contributions from the balance engine explanations map', () => {
    const contributions: BalanceExplanationEntry[] = [
      {
        expenseId: 'e1',
        expenseTitle: 'Dinner',
        paidByMemberId: A,
        memberPaidMinor: 1000,
        memberShareMinor: 400,
        memberNetForExpenseMinor: 600,
      },
    ];
    const explanations = new Map<string, readonly BalanceExplanationEntry[]>();
    explanations.set(A as string, contributions);

    const result: BalanceResult = {
      groupId: GROUP_ID as string,
      currency: CURRENCY,
      memberBalances: [],
      suggestedTransfers: [],
      explanations,
      isBalanced: true,
      validationStatus: 'balanced',
      diagnostics: [],
    };

    const balance = balanceFor(A, 1000, 400, 0, 0);
    const explanation = explainMemberBalance(A, balance, result, CURRENCY);

    expect(explanation.expenseContributions).toHaveLength(1);
    expect(explanation.expenseContributions[0]?.expenseId).toBe('e1');
    expect(explanation.expenseContributions[0]?.expenseTitle).toBe('Dinner');
    expect(explanation.expenseContributions[0]?.paidByMemberId).toBe(A);
    expect(explanation.expenseContributions[0]?.memberPaidMinor).toBe(1000);
    expect(explanation.expenseContributions[0]?.memberShareMinor).toBe(400);
    expect(explanation.expenseContributions[0]?.memberNetForExpenseMinor).toBe(600);
  });
});

describe('buildSettlementExplanations', () => {
  function makeSettlement(from: MemberId, to: MemberId, amount: number): Settlement {
    return createSettlement({
      id: asSettlementId(`s-${from as string}-${to as string}-${amount}`),
      groupId: GROUP_ID,
      fromMemberId: from,
      toMemberId: to,
      amountMinor: amount,
      currencyCode: CURRENCY,
      method: 'cash',
      settlementDate: NOW,
      createdBy: USER_ID,
      now: NOW,
    });
  }

  it('marks settlements sent by the member as reduced_debt', () => {
    const s = makeSettlement(A, B, 200);
    const result = buildSettlementExplanations(A, [s]);

    expect(result).toHaveLength(1);
    expect(result[0]?.settlementId).toBe(s.id as string);
    expect(result[0]?.fromMemberId).toBe(A);
    expect(result[0]?.toMemberId).toBe(B);
    expect(result[0]?.amountMinor).toBe(200);
    expect(result[0]?.impactOnMember).toBe('reduced_debt');
  });

  it('marks settlements received by the member as reduced_credit', () => {
    const s = makeSettlement(A, B, 200);
    const result = buildSettlementExplanations(B, [s]);

    expect(result).toHaveLength(1);
    expect(result[0]?.impactOnMember).toBe('reduced_credit');
    expect(result[0]?.fromMemberId).toBe(A);
    expect(result[0]?.toMemberId).toBe(B);
  });

  it('excludes settlements that reference the member on neither side', () => {
    const s = makeSettlement(A, B, 200);
    const result = buildSettlementExplanations(C, [s]);
    expect(result).toEqual([]);
  });

  it('excludes soft-deleted settlements', () => {
    const s = makeSettlement(A, B, 200);
    const deleted = softDeleteSettlement(s, { expectedVersion: s.version, now: NOW });
    const result = buildSettlementExplanations(A, [deleted]);

    expect(result).toEqual([]);
  });
});

describe('buildRoundingExplanations', () => {
  function makeExpense(id: string, total: number): Expense {
    return createExpense({
      id: asExpenseId(id),
      groupId: GROUP_ID,
      title: `Expense ${id}`,
      amountMinor: total,
      currencyCode: CURRENCY,
      expenseDate: NOW,
      splitType: 'equal',
      createdBy: USER_ID,
      now: NOW,
    });
  }

  function makeSplit(id: string, expense: Expense, member: MemberId, amount: number): ExpenseSplit {
    return createExpenseSplit({
      id: asExpenseSplitId(id),
      expenseId: expense.id,
      memberId: member,
      amountMinor: amount,
      now: NOW,
    });
  }

  it('returns no rounding when splits sum exactly to the expense total', () => {
    const expense = makeExpense('e1', 1000);
    const splits = [
      makeSplit('s1', expense, A, 500),
      makeSplit('s2', expense, B, 300),
      makeSplit('s3', expense, C, 200),
    ];
    const result = buildRoundingExplanations([expense], splits);

    expect(result).toEqual([]);
  });

  it('detects rounding when splits do not sum to the expense total', () => {
    const expense = makeExpense('e1', 1000);
    // Splits sum to 999 → 1 minor unit of remainder.
    const splits = [
      makeSplit('s1', expense, A, 500),
      makeSplit('s2', expense, B, 300),
      makeSplit('s3', expense, C, 199),
    ];
    const result = buildRoundingExplanations([expense], splits);

    expect(result).toHaveLength(1);
    const entry = result[0]!;
    expect(entry.expenseId).toBe('e1');
    expect(entry.totalAmountMinor).toBe(1000);
    expect(entry.splitSumMinor).toBe(999);
    expect(entry.remainderMinor).toBe(1);
    expect(entry.membersReceivingExtra).toHaveLength(1);
    // Distribution method recorded.
    expect(entry.distributionMethod).toBe('earliest_indices');
  });

  it('skips soft-deleted expenses', () => {
    const expense = makeExpense('e1', 1000);
    // Soft-delete by setting deletedAt.
    const deleted: Expense = { ...expense, deletedAt: NOW };
    const splits = [
      makeSplit('s1', expense, A, 500),
      makeSplit('s2', expense, B, 499),
    ];
    const result = buildRoundingExplanations([deleted], splits);

    expect(result).toEqual([]);
  });
});
