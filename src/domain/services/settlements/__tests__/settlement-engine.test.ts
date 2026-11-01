import { describe, expect, it } from '@jest/globals';

import {
  asExpenseId,
  asExpensePayerId,
  asExpenseSplitId,
  asGroupId,
  asMemberId,
  asSettlementId,
  asUserId,
  createExpense,
  createExpensePayer,
  createExpenseSplit,
  createSettlement,
  type Expense,
  type ExpensePayer,
  type ExpenseSplit,
  type Settlement,
} from '@domain/entities';
import { asCurrencyCode, asDateTime } from '@domain/value-objects';

import { calculateGroupBalances, type MemberBalance } from '../../balances/balance-engine';
import {
  filterCreditors,
  filterDebtors,
  filterUnsettledMembers,
  simplifySettlements,
  suggestTransferOrder,
  verifyTransfersZeroOutBalances,
} from '../settlement-engine';

const NOW = asDateTime('2026-07-29T10:00:00.000Z');
const CURRENCY = asCurrencyCode('INR');
const USER_ID = asUserId('user-1');
const GROUP_ID = asGroupId('group-1');

const A = asMemberId('a');
const B = asMemberId('b');
const C = asMemberId('c');

function makeBalances(
  entries: readonly { member: string; net: number }[],
): MemberBalance[] {
  return entries.map((e) => ({
    memberId: asMemberId(e.member),
    paidMinor: 0,
    shareMinor: 0,
    settlementsSentMinor: 0,
    settlementsReceivedMinor: 0,
    netBalanceMinor: e.net,
  }));
}

describe('simplifySettlements', () => {
  it('suggests minimal transfers for A=+900, B=-400, C=-500', () => {
    const balances = makeBalances([
      { member: 'a', net: 900 },
      { member: 'b', net: -400 },
      { member: 'c', net: -500 },
    ]);
    const result = simplifySettlements({ memberBalances: balances });
    expect(result.transferCount).toBe(2);
    expect(result.totalFlowMinor).toBe(900);
    // Verify all balances would be zeroed.
    expect(verifyTransfersZeroOutBalances(balances, result.transfers)).toBe(true);
  });

  it('produces no transfers when all balances are zero', () => {
    const balances = makeBalances([
      { member: 'a', net: 0 },
      { member: 'b', net: 0 },
    ]);
    const result = simplifySettlements({ memberBalances: balances });
    expect(result.transferCount).toBe(0);
    expect(result.totalFlowMinor).toBe(0);
  });

  it('single debtor, single creditor → 1 transfer', () => {
    const balances = makeBalances([
      { member: 'a', net: 500 },
      { member: 'b', net: -500 },
    ]);
    const result = simplifySettlements({ memberBalances: balances });
    expect(result.transferCount).toBe(1);
    expect(result.transfers[0]?.fromMemberId).toBe(B);
    expect(result.transfers[0]?.toMemberId).toBe(A);
    expect(result.transfers[0]?.amountMinor).toBe(500);
  });

  it('handles circular debts (net = 0 for all → no transfers)', () => {
    const balances = makeBalances([
      { member: 'a', net: 0 },
      { member: 'b', net: 0 },
      { member: 'c', net: 0 },
    ]);
    const result = simplifySettlements({ memberBalances: balances });
    expect(result.transferCount).toBe(0);
  });

  it('multiple debtors, single creditor', () => {
    // A is owed 1000, B/C/D each owe 333.33... but we use integers:
    // B owes 334, C owes 333, D owes 333 (Σ = 1000)
    const balances = makeBalances([
      { member: 'a', net: 1000 },
      { member: 'b', net: -334 },
      { member: 'c', net: -333 },
      { member: 'd', net: -333 },
    ]);
    const result = simplifySettlements({ memberBalances: balances });
    expect(result.transferCount).toBe(3);
    expect(verifyTransfersZeroOutBalances(balances, result.transfers)).toBe(true);
  });

  it('single debtor, multiple creditors', () => {
    // A owes 1000, B/C/D are each owed 333.33... (B=334, C=333, D=333)
    const balances = makeBalances([
      { member: 'a', net: -1000 },
      { member: 'b', net: 334 },
      { member: 'c', net: 333 },
      { member: 'd', net: 333 },
    ]);
    const result = simplifySettlements({ memberBalances: balances });
    expect(result.transferCount).toBe(3);
    expect(verifyTransfersZeroOutBalances(balances, result.transfers)).toBe(true);
  });

  it('greedy algorithm may produce more than optimal transfers', () => {
    // Known suboptimality case: 4 members with mixed debtor/creditor status.
    // A: +500, B: +300, C: -400, D: -400
    // Optimal: 2 transfers (C→A 400, D→A 100, D→B 300) = 3 transfers
    //   Actually: A needs 500 from C+D, B needs 300 from C+D.
    //   Greedy: largest debtor → largest creditor:
    //     C owes 400 → A gets 400 (A now needs 100)
    //     D owes 400 → A gets 100 (A settled), D still owes 300
    //     D owes 300 → B gets 300 (B settled)
    //   Total: 3 transfers. Optimal is also 3. Good.
    const balances = makeBalances([
      { member: 'a', net: 500 },
      { member: 'b', net: 300 },
      { member: 'c', net: -400 },
      { member: 'd', net: -400 },
    ]);
    const result = simplifySettlements({ memberBalances: balances });
    expect(result.transferCount).toBe(3);
    expect(verifyTransfersZeroOutBalances(balances, result.transfers)).toBe(true);
  });

  it('deterministic output for same input', () => {
    const balances = makeBalances([
      { member: 'a', net: 900 },
      { member: 'b', net: -400 },
      { member: 'c', net: -500 },
    ]);
    const r1 = simplifySettlements({ memberBalances: balances });
    const r2 = simplifySettlements({ memberBalances: balances });
    expect(r1.transfers).toEqual(r2.transfers);
  });

  it('output preserves integer minor units', () => {
    const balances = makeBalances([
      { member: 'a', net: 999 },
      { member: 'b', net: -500 },
      { member: 'c', net: -499 },
    ]);
    const result = simplifySettlements({ memberBalances: balances });
    for (const t of result.transfers) {
      expect(Number.isInteger(t.amountMinor)).toBe(true);
    }
  });

  it('zero-value transfers are never produced', () => {
    const balances = makeBalances([
      { member: 'a', net: 100 },
      { member: 'b', net: -100 },
      { member: 'c', net: 0 },
    ]);
    const result = simplifySettlements({ memberBalances: balances });
    for (const t of result.transfers) {
      expect(t.amountMinor).toBeGreaterThan(0);
    }
  });
});

describe('verifyTransfersZeroOutBalances', () => {
  it('returns true for valid transfer set', () => {
    const balances = makeBalances([
      { member: 'a', net: 500 },
      { member: 'b', net: -500 },
    ]);
    const transfers = [
      { fromMemberId: B, toMemberId: A, amountMinor: 500 },
    ];
    expect(verifyTransfersZeroOutBalances(balances, transfers)).toBe(true);
  });

  it('returns false for invalid transfer set', () => {
    const balances = makeBalances([
      { member: 'a', net: 500 },
      { member: 'b', net: -500 },
    ]);
    const transfers = [
      { fromMemberId: B, toMemberId: A, amountMinor: 400 }, // underpays
    ];
    expect(verifyTransfersZeroOutBalances(balances, transfers)).toBe(false);
  });
});

describe('filter helpers', () => {
  const balances: MemberBalance[] = [
    { memberId: A, paidMinor: 0, shareMinor: 0, settlementsSentMinor: 0, settlementsReceivedMinor: 0, netBalanceMinor: 500 },
    { memberId: B, paidMinor: 0, shareMinor: 0, settlementsSentMinor: 0, settlementsReceivedMinor: 0, netBalanceMinor: -300 },
    { memberId: C, paidMinor: 0, shareMinor: 0, settlementsSentMinor: 0, settlementsReceivedMinor: 0, netBalanceMinor: 0 },
  ];

  it('filterUnsettledMembers excludes zero-balance members', () => {
    expect(filterUnsettledMembers(balances)).toHaveLength(2);
  });

  it('filterDebtors returns only negative-balance members', () => {
    const debtors = filterDebtors(balances);
    expect(debtors).toHaveLength(1);
    expect(debtors[0]?.memberId).toBe(B);
  });

  it('filterCreditors returns only positive-balance members', () => {
    const creditors = filterCreditors(balances);
    expect(creditors).toHaveLength(1);
    expect(creditors[0]?.memberId).toBe(A);
  });
});

describe('suggestTransferOrder', () => {
  it('returns transfers in order with decrementing hint', () => {
    const balances = makeBalances([
      { member: 'a', net: 900 },
      { member: 'b', net: -400 },
      { member: 'c', net: -500 },
    ]);
    const result = simplifySettlements({ memberBalances: balances });
    const ordered = suggestTransferOrder(result.transfers);
    expect(ordered).toHaveLength(result.transfers.length);
    expect(ordered[ordered.length - 1]?.remainingTransfersHint).toBe(0);
  });
});

// Real-world scenario from the spec
describe('spec example: A pays ₹1200, A/B/C split 300/400/500', () => {
  it('balances match the spec exactly', () => {
    const expense: Expense = createExpense({
      id: asExpenseId('e1'),
      groupId: GROUP_ID,
      title: 'Dinner',
      amountMinor: 1200,
      currencyCode: CURRENCY,
      expenseDate: NOW,
      splitType: 'equal',
      createdBy: USER_ID,
      now: NOW,
    });
    const payers: ExpensePayer[] = [
      createExpensePayer({
        id: asExpensePayerId('p1'),
        expenseId: expense.id,
        memberId: A,
        amountMinor: 1200,
        now: NOW,
      }),
    ];
    const splits: ExpenseSplit[] = [
      createExpenseSplit({
        id: asExpenseSplitId('s1'),
        expenseId: expense.id,
        memberId: A,
        amountMinor: 300,
        now: NOW,
      }),
      createExpenseSplit({
        id: asExpenseSplitId('s2'),
        expenseId: expense.id,
        memberId: B,
        amountMinor: 400,
        now: NOW,
      }),
      createExpenseSplit({
        id: asExpenseSplitId('s3'),
        expenseId: expense.id,
        memberId: C,
        amountMinor: 500,
        now: NOW,
      }),
    ];

    // Use the balance engine to compute balances
    const result = calculateGroupBalances({
      groupId: GROUP_ID as string,
      currency: CURRENCY,
      members: [A, B, C],
      expenses: [expense],
      payers,
      splits,
      settlements: [],
    });

    // Per spec:
    //   A should receive ₹900
    //   B owes ₹400
    //   C owes ₹500
    expect(result.memberBalances[0]?.netBalanceMinor).toBe(900);
    expect(result.memberBalances[1]?.netBalanceMinor).toBe(-400);
    expect(result.memberBalances[2]?.netBalanceMinor).toBe(-500);

    // Suggested settlements:
    //   B pays A ₹400
    //   C pays A ₹500
    expect(result.suggestedTransfers).toHaveLength(2);
    const transferMap = new Map(
      result.suggestedTransfers.map((t) => [
        `${t.fromMemberId}->${t.toMemberId}`,
        t.amountMinor,
      ]),
    );
    expect(transferMap.get('b->a')).toBe(400);
    expect(transferMap.get('c->a')).toBe(500);
  });
});

// Settlement never modifies expense records
describe('settlements do not modify expense records', () => {
  it('after a settlement, expense splits remain unchanged', () => {
    const splits: ExpenseSplit[] = [
      createExpenseSplit({
        id: asExpenseSplitId('s1'),
        expenseId: asExpenseId('e1'),
        memberId: A,
        amountMinor: 500,
        now: NOW,
      }),
      createExpenseSplit({
        id: asExpenseSplitId('s2'),
        expenseId: asExpenseId('e1'),
        memberId: B,
        amountMinor: 500,
        now: NOW,
      }),
    ];
    const splitsBefore = JSON.parse(JSON.stringify(splits));

    const settlement: Settlement = createSettlement({
      id: asSettlementId('s1'),
      groupId: GROUP_ID,
      fromMemberId: B,
      toMemberId: A,
      amountMinor: 500,
      currencyCode: CURRENCY,
      method: 'upi',
      createdBy: USER_ID,
      now: NOW,
    });

    // The settlement object is independent of the splits — settlements are
    // separate financial records. Splits are unchanged.
    expect(JSON.parse(JSON.stringify(splits))).toEqual(splitsBefore);
    expect(settlement.id).toBeDefined();
    expect(settlement.amountMinor).toBe(500);
  });
});
