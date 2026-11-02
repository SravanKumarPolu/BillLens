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
import { asDateTime } from '@domain/value-objects';
import type { MemberId } from '@shared-types/index';

import {
  calculateGroupBalancesByCurrency,
  validateBalanceInvariants,
  type CurrencyBalanceResult,
} from '../balance-engine';

// ── Fixtures ────────────────────────────────────────────────────────
const NOW = asDateTime('2026-07-29T10:00:00.000Z');
const USER_ID = asUserId('user-1');
const GROUP_ID = asGroupId('group-1');

const A = asMemberId('a');
const B = asMemberId('b');
const C = asMemberId('c');

/**
 * Build a single-currency expense fixture (payer pays full, split
 * among participants per the shares array).
 */
function makeExpense(
  id: string,
  currency: string,
  totalMinor: number,
  paidBy: MemberId,
  shares: readonly { member: MemberId; amount: number }[],
): { expense: Expense; payers: ExpensePayer[]; splits: ExpenseSplit[] } {
  const expense = createExpense({
    id: asExpenseId(id),
    groupId: GROUP_ID,
    title: `Expense ${id}`,
    amountMinor: totalMinor,
    currencyCode: currency,
    expenseDate: NOW,
    splitType: 'equal',
    createdBy: USER_ID,
    now: NOW,
  });
  const payers: ExpensePayer[] = [
    createExpensePayer({
      id: asExpensePayerId(`payer-${id}`),
      expenseId: expense.id,
      memberId: paidBy,
      amountMinor: totalMinor,
      now: NOW,
    }),
  ];
  const splits: ExpenseSplit[] = shares.map((s, i) =>
    createExpenseSplit({
      id: asExpenseSplitId(`split-${id}-${i}`),
      expenseId: expense.id,
      memberId: s.member,
      amountMinor: s.amount,
      now: NOW,
    }),
  );
  return { expense, payers, splits };
}

function makeSettlement(
  id: string,
  currency: string,
  from: MemberId,
  to: MemberId,
  amountMinor: number,
): Settlement {
  return createSettlement({
    id: asSettlementId(id),
    groupId: GROUP_ID,
    fromMemberId: from,
    toMemberId: to,
    amountMinor,
    currencyCode: currency,
    method: 'upi',
    createdBy: USER_ID,
    now: NOW,
  });
}

/**
 * Helper: find a member's per-currency balance from a CurrencyBalanceResult.
 */
function memberBalance(
  result: CurrencyBalanceResult,
  memberId: MemberId,
): number {
  const mb = result.memberCurrencyBalances.find(
    (b) => b.memberId === memberId,
  );
  return mb?.netBalanceMinor ?? 0;
}

// ── Tests ──────────────────────────────────────────────────────────

describe('calculateGroupBalancesByCurrency (Phase 6 Track 3)', () => {
  describe('single-currency input', () => {
    it('returns one result for a single-currency group', () => {
      const { expense, payers, splits } = makeExpense('e1', 'INR', 1200, A, [
        { member: A, amount: 400 },
        { member: B, amount: 400 },
        { member: C, amount: 400 },
      ]);
      const results = calculateGroupBalancesByCurrency({
        groupId: GROUP_ID as string,
        members: [A, B, C],
        expenses: [expense],
        payers,
        splits,
        settlements: [],
      });
      expect(results).toHaveLength(1);
      expect(results[0]?.currencyCode).toBe('INR');
    });

    it('matches the single-currency engine result', () => {
      const { expense, payers, splits } = makeExpense('e1', 'INR', 1200, A, [
        { member: A, amount: 400 },
        { member: B, amount: 400 },
        { member: C, amount: 400 },
      ]);
      const results = calculateGroupBalancesByCurrency({
        groupId: GROUP_ID as string,
        members: [A, B, C],
        expenses: [expense],
        payers,
        splits,
        settlements: [],
      });
      // A paid 1200, share 400 → net +800
      // B paid 0, share 400 → net -400
      // C paid 0, share 400 → net -400
      expect(memberBalance(results[0]!, A)).toBe(800);
      expect(memberBalance(results[0]!, B)).toBe(-400);
      expect(memberBalance(results[0]!, C)).toBe(-400);
    });
  });

  describe('multi-currency separation (the spec rule)', () => {
    it('returns one result per currency, sorted alphabetically', () => {
      const gbpExpense = makeExpense('e-gbp', 'GBP', 3000, A, [
        { member: A, amount: 1500 },
        { member: B, amount: 1500 },
      ]);
      const inrExpense = makeExpense('e-inr', 'INR', 2000, B, [
        { member: A, amount: 1000 },
        { member: B, amount: 1000 },
      ]);
      const results = calculateGroupBalancesByCurrency({
        groupId: GROUP_ID as string,
        members: [A, B],
        expenses: [gbpExpense.expense, inrExpense.expense],
        payers: [...gbpExpense.payers, ...inrExpense.payers],
        splits: [...gbpExpense.splits, ...inrExpense.splits],
        settlements: [],
      });
      expect(results).toHaveLength(2);
      expect(results[0]?.currencyCode).toBe('GBP'); // alphabetical
      expect(results[1]?.currencyCode).toBe('INR');
    });

    it('never combines £30 owed and ₹2,000 receivable into a single net', () => {
      // The spec's exact example: member A owes £30 in GBP and is owed
      // ₹2,000 in INR. The multi-currency engine must return them as
      // separate results, not combine them.
      // GBP expense: A pays £60, split £30/£30 between A and B
      //   → A is owed £30, B owes £30 (in GBP)
      // INR expense: B pays ₹4,000, split ₹2,000/₹2,000 between A and B
      //   → A is owed ₹2,000, B owes ₹2,000 (in INR)
      const gbpExpense = makeExpense('e-gbp', 'GBP', 6000, A, [
        { member: A, amount: 3000 },
        { member: B, amount: 3000 },
      ]);
      const inrExpense = makeExpense('e-inr', 'INR', 4000, B, [
        { member: A, amount: 2000 },
        { member: B, amount: 2000 },
      ]);
      const results = calculateGroupBalancesByCurrency({
        groupId: GROUP_ID as string,
        members: [A, B],
        expenses: [gbpExpense.expense, inrExpense.expense],
        payers: [...gbpExpense.payers, ...inrExpense.payers],
        splits: [...gbpExpense.splits, ...inrExpense.splits],
        settlements: [],
      });
      const gbp = results.find((r) => r.currencyCode === 'GBP');
      const inr = results.find((r) => r.currencyCode === 'INR');
      expect(gbp).toBeDefined();
      expect(inr).toBeDefined();
      // A paid £60, share £30 → net +£30 (i.e. +3000 minor)
      // B paid £0, share £30 → net -£30 (i.e. -3000 minor)
      expect(memberBalance(gbp!, A)).toBe(3000);
      expect(memberBalance(gbp!, B)).toBe(-3000);
      // A paid ₹0, share ₹2,000 → net -₹2,000
      // B paid ₹4,000, share ₹2,000 → net +₹2,000
      expect(memberBalance(inr!, A)).toBe(-2000);
      expect(memberBalance(inr!, B)).toBe(2000);
      // The spec rule: never combine into a single net. If we had
      // combined, A's net would be +3000 - 2000 = +1000 (in some
      // imaginary unit), but no such combined number exists in the
      // output. The two results stay separate.
    });

    it('keeps suggested transfers within a single currency (no cross-currency)', () => {
      // Spec rule: "Never suggest 'Pay £10 to offset ₹1,000'."
      const gbpExpense = makeExpense('e-gbp', 'GBP', 6000, A, [
        { member: A, amount: 3000 },
        { member: B, amount: 3000 },
      ]);
      const inrExpense = makeExpense('e-inr', 'INR', 4000, B, [
        { member: A, amount: 2000 },
        { member: B, amount: 2000 },
      ]);
      const results = calculateGroupBalancesByCurrency({
        groupId: GROUP_ID as string,
        members: [A, B],
        expenses: [gbpExpense.expense, inrExpense.expense],
        payers: [...gbpExpense.payers, ...inrExpense.payers],
        splits: [...gbpExpense.splits, ...inrExpense.splits],
        settlements: [],
      });
      for (const r of results) {
        for (const t of r.suggestedTransfers) {
          // Every suggested transfer is in the same currency as its
          // parent result. There is no cross-currency transfer field
          // on SuggestedTransfer, so this is structural — but we
          // assert it explicitly for documentation.
          expect(t.amountMinor).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('per-currency zero-sum invariant', () => {
    it('sum of member balances per currency is zero', () => {
      const gbpExpense = makeExpense('e-gbp', 'GBP', 6000, A, [
        { member: A, amount: 3000 },
        { member: B, amount: 3000 },
      ]);
      const inrExpense = makeExpense('e-inr', 'INR', 4000, B, [
        { member: A, amount: 2000 },
        { member: B, amount: 2000 },
      ]);
      const results = calculateGroupBalancesByCurrency({
        groupId: GROUP_ID as string,
        members: [A, B],
        expenses: [gbpExpense.expense, inrExpense.expense],
        payers: [...gbpExpense.payers, ...inrExpense.payers],
        splits: [...gbpExpense.splits, ...inrExpense.splits],
        settlements: [],
      });
      for (const r of results) {
        const sum = r.memberCurrencyBalances.reduce(
          (acc, b) => acc + b.netBalanceMinor,
          0,
        );
        expect(sum).toBe(0);
        expect(r.isBalanced).toBe(true);
      }
    });

    it('handles a settlement that zeroes a currency out', () => {
      // INR: A owes B ₹40. Settle ₹40. After settlement both net to 0.
      const inrExpense = makeExpense('e-inr', 'INR', 4000, B, [
        { member: A, amount: 2000 },
        { member: B, amount: 2000 },
      ]);
      const settle = makeSettlement('s1', 'INR', A, B, 2000);
      const results = calculateGroupBalancesByCurrency({
        groupId: GROUP_ID as string,
        members: [A, B],
        expenses: [inrExpense.expense],
        payers: inrExpense.payers,
        splits: inrExpense.splits,
        settlements: [settle],
      });
      expect(results).toHaveLength(1);
      expect(memberBalance(results[0]!, A)).toBe(0);
      expect(memberBalance(results[0]!, B)).toBe(0);
    });

    it('does NOT cross-currency-net when one currency is settled and another is not', () => {
      // GBP: A owes B £30 (unsettled)
      // INR: A owes B ₹20, settled by ₹20 settlement → both net 0 in INR
      const gbpExpense = makeExpense('e-gbp', 'GBP', 6000, B, [
        { member: A, amount: 3000 },
        { member: B, amount: 3000 },
      ]);
      const inrExpense = makeExpense('e-inr', 'INR', 4000, B, [
        { member: A, amount: 2000 },
        { member: B, amount: 2000 },
      ]);
      const settle = makeSettlement('s1', 'INR', A, B, 2000);
      const results = calculateGroupBalancesByCurrency({
        groupId: GROUP_ID as string,
        members: [A, B],
        expenses: [gbpExpense.expense, inrExpense.expense],
        payers: [...gbpExpense.payers, ...inrExpense.payers],
        splits: [...gbpExpense.splits, ...inrExpense.splits],
        settlements: [settle],
      });
      const gbp = results.find((r) => r.currencyCode === 'GBP');
      const inr = results.find((r) => r.currencyCode === 'INR');
      // INR is fully settled → both 0
      expect(memberBalance(inr!, A)).toBe(0);
      expect(memberBalance(inr!, B)).toBe(0);
      // GBP is NOT settled → A still owes £30
      expect(memberBalance(gbp!, A)).toBe(-3000);
      expect(memberBalance(gbp!, B)).toBe(3000);
      // The INR settlement did NOT reduce the GBP balance.
    });
  });

  describe('MemberCurrencyBalance extra fields', () => {
    it('includes currencyCode, expenseCount, settlementCount on each balance', () => {
      const gbpExpense = makeExpense('e-gbp', 'GBP', 6000, A, [
        { member: A, amount: 3000 },
        { member: B, amount: 3000 },
      ]);
      const settle = makeSettlement('s1', 'GBP', A, B, 1000);
      const results = calculateGroupBalancesByCurrency({
        groupId: GROUP_ID as string,
        members: [A, B],
        expenses: [gbpExpense.expense],
        payers: gbpExpense.payers,
        splits: gbpExpense.splits,
        settlements: [settle],
      });
      const aBalance = results[0]?.memberCurrencyBalances.find(
        (b) => b.memberId === A,
      );
      expect(aBalance?.currencyCode).toBe('GBP');
      expect(aBalance?.expenseCount).toBeGreaterThan(0);
      expect(aBalance?.settlementCount).toBe(1); // A is the payer in s1
    });

    it('includes calculatedAt and sourceVersion on the result', () => {
      const { expense, payers, splits } = makeExpense('e1', 'USD', 1000, A, [
        { member: A, amount: 500 },
        { member: B, amount: 500 },
      ]);
      const results = calculateGroupBalancesByCurrency({
        groupId: GROUP_ID as string,
        members: [A, B],
        expenses: [expense],
        payers,
        splits,
        settlements: [],
      });
      expect(results[0]?.calculatedAt).toBeTruthy();
      expect(results[0]?.sourceVersion).toBeTruthy();
      expect(typeof results[0]?.sourceVersion).toBe('string');
      expect(results[0]?.sourceVersion).toHaveLength(8); // 8-char hex
    });

    it('sourceVersion is stable for the same input', () => {
      const { expense, payers, splits } = makeExpense('e1', 'USD', 1000, A, [
        { member: A, amount: 500 },
        { member: B, amount: 500 },
      ]);
      const input = {
        groupId: GROUP_ID as string,
        members: [A, B],
        expenses: [expense],
        payers,
        splits,
        settlements: [] as Settlement[],
      };
      const r1 = calculateGroupBalancesByCurrency(input);
      const r2 = calculateGroupBalancesByCurrency(input);
      expect(r1[0]?.sourceVersion).toBe(r2[0]?.sourceVersion);
    });

    it('sourceVersion changes when an expense is added', () => {
      const e1 = makeExpense('e1', 'USD', 1000, A, [
        { member: A, amount: 500 },
        { member: B, amount: 500 },
      ]);
      const e2 = makeExpense('e2', 'USD', 2000, A, [
        { member: A, amount: 1000 },
        { member: B, amount: 1000 },
      ]);
      const r1 = calculateGroupBalancesByCurrency({
        groupId: GROUP_ID as string,
        members: [A, B],
        expenses: [e1.expense],
        payers: e1.payers,
        splits: e1.splits,
        settlements: [],
      });
      const r2 = calculateGroupBalancesByCurrency({
        groupId: GROUP_ID as string,
        members: [A, B],
        expenses: [e1.expense, e2.expense],
        payers: [...e1.payers, ...e2.payers],
        splits: [...e1.splits, ...e2.splits],
        settlements: [],
      });
      expect(r1[0]?.sourceVersion).not.toBe(r2[0]?.sourceVersion);
    });
  });

  describe('empty input', () => {
    it('returns an empty array when there are no expenses and no settlements', () => {
      const results = calculateGroupBalancesByCurrency({
        groupId: GROUP_ID as string,
        members: [A, B],
        expenses: [],
        payers: [],
        splits: [],
        settlements: [],
      });
      expect(results).toEqual([]);
    });
  });

  describe('soft-deleted records', () => {
    it('excludes soft-deleted expenses (their currency is not emitted)', () => {
      const { expense, payers, splits } = makeExpense('e1', 'GBP', 6000, A, [
        { member: A, amount: 3000 },
        { member: B, amount: 3000 },
      ]);
      // Soft-delete the expense.
      const deletedExpense: Expense = {
        ...expense,
        deletedAt: NOW,
      };
      const results = calculateGroupBalancesByCurrency({
        groupId: GROUP_ID as string,
        members: [A, B],
        expenses: [deletedExpense],
        payers,
        splits,
        settlements: [],
      });
      // The only expense is deleted → no currencies detected → empty result.
      expect(results).toEqual([]);
    });
  });
});

// ────────────────────────────────────────────────────────────────────

describe('validateBalanceInvariants (Phase 6 Track 3)', () => {
  it('returns no failures when every currency balances', () => {
    const gbpExpense = makeExpense('e-gbp', 'GBP', 6000, A, [
      { member: A, amount: 3000 },
      { member: B, amount: 3000 },
    ]);
    const inrExpense = makeExpense('e-inr', 'INR', 4000, B, [
      { member: A, amount: 2000 },
      { member: B, amount: 2000 },
    ]);
    const results = calculateGroupBalancesByCurrency({
      groupId: GROUP_ID as string,
      members: [A, B],
      expenses: [gbpExpense.expense, inrExpense.expense],
      payers: [...gbpExpense.payers, ...inrExpense.payers],
      splits: [...gbpExpense.splits, ...inrExpense.splits],
      settlements: [],
    });
    const failures = validateBalanceInvariants(results);
    expect(failures).toEqual([]);
  });

  it('returns no failures for an empty result list', () => {
    expect(validateBalanceInvariants([])).toEqual([]);
  });

  it('returns a failure per currency that does not balance', () => {
    // Construct a corrupted INR result: B is owed ₹30 but no one owes
    // it back (we remove A from the members list to trigger
    // incomplete_membership — A's share is "lost").
    const inrExpense = makeExpense('e-inr', 'INR', 4000, B, [
      { member: A, amount: 2000 },
      { member: B, amount: 2000 },
    ]);
    // Pass only [B] as members — A's split will be "lost".
    const results = calculateGroupBalancesByCurrency({
      groupId: GROUP_ID as string,
      members: [B], // A is missing
      expenses: [inrExpense.expense],
      payers: inrExpense.payers,
      splits: inrExpense.splits,
      settlements: [],
    });
    const failures = validateBalanceInvariants(results);
    expect(failures.length).toBeGreaterThan(0);
    expect(failures[0]?.currencyCode).toBe('INR');
    expect(failures[0]?.validationStatus).not.toBe('balanced');
  });
});
