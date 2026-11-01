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
  softDeleteExpensePayer,
  softDeleteExpenseSplit,
  type Expense,
  type ExpensePayer,
  type ExpenseSplit,
  type Settlement,
} from '@domain/entities';
import { asCurrencyCode, asDateTime } from '@domain/value-objects';
import type { MemberId } from '@shared-types/index';

import { calculateGroupBalances, explainMemberBalance } from '../balance-engine';

const NOW = asDateTime('2026-07-29T10:00:00.000Z');
const CURRENCY = asCurrencyCode('INR');
const USER_ID = asUserId('user-1');
const GROUP_ID = asGroupId('group-1');

const A = asMemberId('a');
const B = asMemberId('b');
const C = asMemberId('c');

function makeExpenseFixture(
  id: string,
  totalMinor: number,
  paidBy: MemberId,
  shares: readonly { member: MemberId; amount: number }[],
): { expense: Expense; payers: ExpensePayer[]; splits: ExpenseSplit[] } {
  const expense = createExpense({
    id: asExpenseId(id),
    groupId: GROUP_ID,
    title: `Expense ${id}`,
    amountMinor: totalMinor,
    currencyCode: CURRENCY,
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
    currencyCode: CURRENCY,
    method: 'upi',
    createdBy: USER_ID,
    now: NOW,
  });
}

describe('calculateGroupBalances', () => {
  describe('basic scenarios', () => {
    it('one payer, multiple participants (A pays ₹1200, A/B/C split 300/400/500)', () => {
      const { expense, payers, splits } = makeExpenseFixture('e1', 1200, A, [
        { member: A, amount: 300 },
        { member: B, amount: 400 },
        { member: C, amount: 500 },
      ]);
      const result = calculateGroupBalances({
        groupId: GROUP_ID as string,
        currency: CURRENCY,
        members: [A, B, C],
        expenses: [expense],
        payers,
        splits,
        settlements: [],
      });

      const aBalance = result.memberBalances.find((b) => b.memberId === A);
      const bBalance = result.memberBalances.find((b) => b.memberId === B);
      const cBalance = result.memberBalances.find((b) => b.memberId === C);

      // A paid 1200, share 300 → net = 1200 - 300 = 900 (creditor)
      expect(aBalance?.paidMinor).toBe(1200);
      expect(aBalance?.shareMinor).toBe(300);
      expect(aBalance?.netBalanceMinor).toBe(900);

      // B paid 0, share 400 → net = -400 (debtor)
      expect(bBalance?.netBalanceMinor).toBe(-400);

      // C paid 0, share 500 → net = -500 (debtor)
      expect(cBalance?.netBalanceMinor).toBe(-500);

      // Conservation: Σ net = 0
      expect(result.isBalanced).toBe(true);
    });

    it('multiple payers (A pays 600, B pays 400, total 1000, split 500/500)', () => {
      const expense = createExpense({
        id: asExpenseId('e1'),
        groupId: GROUP_ID,
        title: 'Test',
        amountMinor: 1000,
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
          amountMinor: 600,
          now: NOW,
        }),
        createExpensePayer({
          id: asExpensePayerId('p2'),
          expenseId: expense.id,
          memberId: B,
          amountMinor: 400,
          now: NOW,
        }),
      ];
      const splits: ExpenseSplit[] = [
        createExpenseSplit({
          id: asExpenseSplitId('s1'),
          expenseId: expense.id,
          memberId: A,
          amountMinor: 500,
          now: NOW,
        }),
        createExpenseSplit({
          id: asExpenseSplitId('s2'),
          expenseId: expense.id,
          memberId: B,
          amountMinor: 500,
          now: NOW,
        }),
      ];

      const result = calculateGroupBalances({
        groupId: GROUP_ID as string,
        currency: CURRENCY,
        members: [A, B],
        expenses: [expense],
        payers,
        splits,
        settlements: [],
      });

      // A: paid 600, share 500 → net = +100
      // B: paid 400, share 500 → net = -100
      expect(result.memberBalances[0]?.netBalanceMinor).toBe(100);
      expect(result.memberBalances[1]?.netBalanceMinor).toBe(-100);
      expect(result.isBalanced).toBe(true);
    });

    it('empty expenses list returns all-zero balances', () => {
      const result = calculateGroupBalances({
        groupId: GROUP_ID as string,
        currency: CURRENCY,
        members: [A, B, C],
        expenses: [],
        payers: [],
        splits: [],
        settlements: [],
      });

      for (const b of result.memberBalances) {
        expect(b.paidMinor).toBe(0);
        expect(b.shareMinor).toBe(0);
        expect(b.netBalanceMinor).toBe(0);
      }
      expect(result.suggestedTransfers).toEqual([]);
      expect(result.isBalanced).toBe(true);
    });
  });

  describe('settlements', () => {
    it('partial settlement reduces but does not eliminate debt', () => {
      // A paid 1200, share 300 → +900. B owes 400, C owes 500.
      const { expense, payers, splits } = makeExpenseFixture('e1', 1200, A, [
        { member: A, amount: 300 },
        { member: B, amount: 400 },
        { member: C, amount: 500 },
      ]);
      // B settles 200 of their 400 debt to A.
      const settlement = makeSettlement('s1', B, A, 200);

      const result = calculateGroupBalances({
        groupId: GROUP_ID as string,
        currency: CURRENCY,
        members: [A, B, C],
        expenses: [expense],
        payers,
        splits,
        settlements: [settlement],
      });

      const aBalance = result.memberBalances.find((b) => b.memberId === A);
      const bBalance = result.memberBalances.find((b) => b.memberId === B);
      const cBalance = result.memberBalances.find((b) => b.memberId === C);

      // net = paid - share - received + sent
      // A: 1200 - 300 - 200 + 0 = 700 (was owed 900, received 200 → still owed 700)
      // B: 0 - 400 - 0 + 200 = -200 (owed 400, paid 200 → still owes 200)
      // C: 0 - 500 - 0 + 0 = -500 (unchanged)
      expect(aBalance?.netBalanceMinor).toBe(700);
      expect(bBalance?.netBalanceMinor).toBe(-200);
      expect(cBalance?.netBalanceMinor).toBe(-500);
      expect(result.isBalanced).toBe(true);
    });

    it('full settlement zeros out both parties', () => {
      const { expense, payers, splits } = makeExpenseFixture('e1', 1200, A, [
        { member: A, amount: 300 },
        { member: B, amount: 400 },
        { member: C, amount: 500 },
      ]);
      // B fully settles 400 debt to A.
      const settlement = makeSettlement('s1', B, A, 400);

      const result = calculateGroupBalances({
        groupId: GROUP_ID as string,
        currency: CURRENCY,
        members: [A, B, C],
        expenses: [expense],
        payers,
        splits,
        settlements: [settlement],
      });

      const aBalance = result.memberBalances.find((b) => b.memberId === A);
      const bBalance = result.memberBalances.find((b) => b.memberId === B);
      const cBalance = result.memberBalances.find((b) => b.memberId === C);

      // net = paid - share - received + sent
      // A: 1200 - 300 - 400 + 0 = 500 (was owed 900, received 400 → still owed 500)
      //   A is still a creditor because C still owes 500.
      // B: 0 - 400 - 0 + 400 = 0 (fully settled)
      // C: 0 - 500 - 0 + 0 = -500 (unchanged)
      // Σ = 500 + 0 - 500 = 0 ✓
      expect(aBalance?.netBalanceMinor).toBe(500);
      expect(bBalance?.netBalanceMinor).toBe(0);
      expect(cBalance?.netBalanceMinor).toBe(-500);
      expect(result.isBalanced).toBe(true);
    });

    it('overpayment is mathematically allowed but creates inverse balance', () => {
      // If B pays A 500 but only owed 400, B becomes a creditor of 100.
      const { expense, payers, splits } = makeExpenseFixture('e1', 1200, A, [
        { member: A, amount: 300 },
        { member: B, amount: 400 },
        { member: C, amount: 500 },
      ]);
      const settlement = makeSettlement('s1', B, A, 500);

      const result = calculateGroupBalances({
        groupId: GROUP_ID as string,
        currency: CURRENCY,
        members: [A, B, C],
        expenses: [expense],
        payers,
        splits,
        settlements: [settlement],
      });

      const aBalance = result.memberBalances.find((b) => b.memberId === A);
      const bBalance = result.memberBalances.find((b) => b.memberId === B);
      const cBalance = result.memberBalances.find((b) => b.memberId === C);

      // net = paid - share - received + sent
      // B: 0 - 400 - 0 + 500 = +100 (overpaid by 100 → becomes a creditor)
      // A: 1200 - 300 - 500 + 0 = 400 (was owed 900, received 500 → still owed 400)
      // C: 0 - 500 - 0 + 0 = -500 (unchanged)
      // Σ = 400 + 100 - 500 = 0 ✓
      expect(aBalance?.netBalanceMinor).toBe(400);
      expect(bBalance?.netBalanceMinor).toBe(100);
      expect(cBalance?.netBalanceMinor).toBe(-500);
      expect(result.isBalanced).toBe(true);
    });
  });

  describe('settlement lifecycle status (completed-balance contract)', () => {
    /**
     * Regression tests for the `contributesToCompletedBalance` contract:
     * ONLY completed settlements move the completed balance. Before this
     * filter was added, a pending-confirmation settlement already moved
     * balances and a reversed settlement double-counted against its own
     * reversal record.
     */
    function makeStatusedSettlement(
      id: string,
      from: MemberId,
      to: MemberId,
      amountMinor: number,
      status: Settlement['status'],
    ): Settlement {
      const base = makeSettlement(id, from, to, amountMinor);
      return { ...base, status };
    }

    function fixture1200() {
      // A paid 1200, split A/B/C = 300/400/500 → A +900, B -400, C -500.
      return makeExpenseFixture('e1', 1200, A, [
        { member: A, amount: 300 },
        { member: B, amount: 400 },
        { member: C, amount: 500 },
      ]);
    }

    it('a pending_confirmation settlement does NOT move balances', () => {
      const { expense, payers, splits } = fixture1200();
      const pending = makeStatusedSettlement('s1', B, A, 400, 'pending_confirmation');

      const result = calculateGroupBalances({
        groupId: GROUP_ID as string,
        currency: CURRENCY,
        members: [A, B, C],
        expenses: [expense],
        payers,
        splits,
        settlements: [pending],
      });

      const aBalance = result.memberBalances.find((b) => b.memberId === A);
      const bBalance = result.memberBalances.find((b) => b.memberId === B);
      expect(aBalance?.netBalanceMinor).toBe(900);
      expect(bBalance?.netBalanceMinor).toBe(-400);
    });

    it('draft, requested, failed, cancelled, and disputed settlements are all excluded', () => {
      const { expense, payers, splits } = fixture1200();
      const nonCompleted: Settlement[] = [
        makeStatusedSettlement('s1', B, A, 400, 'draft'),
        makeStatusedSettlement('s2', B, A, 400, 'requested'),
        makeStatusedSettlement('s3', B, A, 400, 'failed'),
        makeStatusedSettlement('s4', B, A, 400, 'cancelled'),
        makeStatusedSettlement('s5', B, A, 400, 'disputed'),
      ];

      const result = calculateGroupBalances({
        groupId: GROUP_ID as string,
        currency: CURRENCY,
        members: [A, B, C],
        expenses: [expense],
        payers,
        splits,
        settlements: nonCompleted,
      });

      const aBalance = result.memberBalances.find((b) => b.memberId === A);
      const bBalance = result.memberBalances.find((b) => b.memberId === B);
      expect(aBalance?.netBalanceMinor).toBe(900);
      expect(bBalance?.netBalanceMinor).toBe(-400);
    });

    it('a reversed settlement + its completed reversal record cancel out (no double count)', () => {
      const { expense, payers, splits } = fixture1200();
      // B settled 400 to A (completed), then it was reversed: the original
      // becomes 'reversed' and a NEW completed record swaps from/to.
      const original = makeStatusedSettlement('s1', B, A, 400, 'reversed');
      const reversal: Settlement = {
        ...makeSettlement('s1-rev', A, B, 400),
        status: 'completed',
        reversalOfSettlementId: original.id,
      };

      const result = calculateGroupBalances({
        groupId: GROUP_ID as string,
        currency: CURRENCY,
        members: [A, B, C],
        expenses: [expense],
        payers,
        splits,
        settlements: [original, reversal],
      });

      // Net effect of the pair is ZERO → balances revert to the pre-settlement
      // state. (Excluding the reversed original while counting its reversal
      // would INVERT the payment: A 1300 / B −800 — a corrupted ledger.)
      const aBalance = result.memberBalances.find((b) => b.memberId === A);
      const bBalance = result.memberBalances.find((b) => b.memberId === B);
      expect(aBalance?.netBalanceMinor).toBe(900);
      expect(bBalance?.netBalanceMinor).toBe(-400);
      expect(result.isBalanced).toBe(true);
    });

    it('a settlement with NO status (pre-Phase-6 row) still counts as completed', () => {
      const { expense, payers, splits } = fixture1200();
      const legacy = makeSettlement('s1', B, A, 400); // status undefined

      const result = calculateGroupBalances({
        groupId: GROUP_ID as string,
        currency: CURRENCY,
        members: [A, B, C],
        expenses: [expense],
        payers,
        splits,
        settlements: [legacy],
      });

      const aBalance = result.memberBalances.find((b) => b.memberId === A);
      const bBalance = result.memberBalances.find((b) => b.memberId === B);
      expect(aBalance?.netBalanceMinor).toBe(500);
      expect(bBalance?.netBalanceMinor).toBe(0);
    });

    it('a completed settlement still counts (the filter does not over-exclude)', () => {
      const { expense, payers, splits } = fixture1200();
      const completed = makeStatusedSettlement('s1', B, A, 400, 'completed');

      const result = calculateGroupBalances({
        groupId: GROUP_ID as string,
        currency: CURRENCY,
        members: [A, B, C],
        expenses: [expense],
        payers,
        splits,
        settlements: [completed],
      });

      const aBalance = result.memberBalances.find((b) => b.memberId === A);
      const bBalance = result.memberBalances.find((b) => b.memberId === B);
      expect(aBalance?.netBalanceMinor).toBe(500);
      expect(bBalance?.netBalanceMinor).toBe(0);
    });
  });

  describe('soft-deleted records', () => {
    it('deleted expenses are excluded from balances', () => {
      const { expense, payers, splits } = makeExpenseFixture('e1', 1200, A, [
        { member: A, amount: 300 },
        { member: B, amount: 400 },
        { member: C, amount: 500 },
      ]);
      // Soft-delete the expense.
      const deletedExpense: Expense = { ...expense, deletedAt: NOW };

      const result = calculateGroupBalances({
        groupId: GROUP_ID as string,
        currency: CURRENCY,
        members: [A, B, C],
        expenses: [deletedExpense],
        payers,
        splits,
        settlements: [],
      });

      for (const b of result.memberBalances) {
        expect(b.netBalanceMinor).toBe(0);
      }
    });

    it('deleted settlements are excluded from balances', () => {
      const { expense, payers, splits } = makeExpenseFixture('e1', 1200, A, [
        { member: A, amount: 300 },
        { member: B, amount: 400 },
        { member: C, amount: 500 },
      ]);
      const settlement: Settlement = {
        ...makeSettlement('s1', B, A, 400),
        deletedAt: NOW,
      };

      const result = calculateGroupBalances({
        groupId: GROUP_ID as string,
        currency: CURRENCY,
        members: [A, B, C],
        expenses: [expense],
        payers,
        splits,
        settlements: [settlement],
      });

      // Without the settlement, balances should be: A=+900, B=-400, C=-500
      const aBalance = result.memberBalances.find((b) => b.memberId === A);
      expect(aBalance?.netBalanceMinor).toBe(900);
    });
  });

  describe('suggested transfers', () => {
    it('suggests B pays A 400 and C pays A 500', () => {
      const { expense, payers, splits } = makeExpenseFixture('e1', 1200, A, [
        { member: A, amount: 300 },
        { member: B, amount: 400 },
        { member: C, amount: 500 },
      ]);
      const result = calculateGroupBalances({
        groupId: GROUP_ID as string,
        currency: CURRENCY,
        members: [A, B, C],
        expenses: [expense],
        payers,
        splits,
        settlements: [],
      });

      expect(result.suggestedTransfers).toHaveLength(2);
      const transferMap = new Map(
        result.suggestedTransfers.map((t) => [`${t.fromMemberId}->${t.toMemberId}`, t.amountMinor]),
      );
      expect(transferMap.get('b->a')).toBe(400);
      expect(transferMap.get('c->a')).toBe(500);
    });

    it('suggested transfers zero out all balances when executed', () => {
      const { expense, payers, splits } = makeExpenseFixture('e1', 1200, A, [
        { member: A, amount: 300 },
        { member: B, amount: 400 },
        { member: C, amount: 500 },
      ]);
      const result = calculateGroupBalances({
        groupId: GROUP_ID as string,
        currency: CURRENCY,
        members: [A, B, C],
        expenses: [expense],
        payers,
        splits,
        settlements: [],
      });

      // Apply transfers
      const after = new Map<string, number>();
      for (const b of result.memberBalances) {
        after.set(b.memberId as string, b.netBalanceMinor);
      }
      for (const t of result.suggestedTransfers) {
        const fromKey = t.fromMemberId as string;
        const toKey = t.toMemberId as string;
        after.set(fromKey, (after.get(fromKey) ?? 0) + t.amountMinor);
        after.set(toKey, (after.get(toKey) ?? 0) - t.amountMinor);
      }
      for (const value of after.values()) {
        expect(value).toBe(0);
      }
    });

    it('circular debts: A owes B 100, B owes C 100, C owes A 100 → 0 transfers', () => {
      // A: +100 (paid 100 share 0)... hmm, let me construct this differently.
      // Expense 1: A pays 100, A and B split 50/50
      //   → A: paid 100, share 50 → net +50
      //   → B: paid 0, share 50 → net -50
      // Expense 2: B pays 100, B and C split 50/50
      //   → B: paid 100, share 50 → net +50
      //   → C: paid 0, share 50 → net -50
      // Expense 3: C pays 100, C and A split 50/50
      //   → C: paid 100, share 50 → net +50
      //   → A: paid 0, share 50 → net -50
      // Totals:
      //   A: 50 + (-50) = 0
      //   B: -50 + 50 = 0
      //   C: -50 + 50 = 0
      const e1 = makeExpenseFixture('e1', 100, A, [
        { member: A, amount: 50 },
        { member: B, amount: 50 },
      ]);
      const e2 = makeExpenseFixture('e2', 100, B, [
        { member: B, amount: 50 },
        { member: C, amount: 50 },
      ]);
      const e3 = makeExpenseFixture('e3', 100, C, [
        { member: C, amount: 50 },
        { member: A, amount: 50 },
      ]);

      const result = calculateGroupBalances({
        groupId: GROUP_ID as string,
        currency: CURRENCY,
        members: [A, B, C],
        expenses: [e1.expense, e2.expense, e3.expense],
        payers: [...e1.payers, ...e2.payers, ...e3.payers],
        splits: [...e1.splits, ...e2.splits, ...e3.splits],
        settlements: [],
      });

      for (const b of result.memberBalances) {
        expect(b.netBalanceMinor).toBe(0);
      }
      expect(result.suggestedTransfers).toHaveLength(0);
    });

    it('multiple creditors and debtors', () => {
      // 4 members: A and B are creditors (+300, +200), C and D are debtors (-250, -250).
      // Expense 1: A pays 600, A/B/C/D split 300/300/0/0... wait let me think.
      // Simpler: A pays 600, all 4 split 150 each → A: +450, B: -150, C: -150, D: -150.
      // That gives 1 creditor, 3 debtors.
      // Let's do 2 creditors: A pays 600, B pays 400, all 4 split 250 each →
      //   A: 600-250 = +350, B: 400-250 = +150, C: -250, D: -250
      const e1 = createExpense({
        id: asExpenseId('e1'),
        groupId: GROUP_ID,
        title: 'A pays',
        amountMinor: 600,
        currencyCode: CURRENCY,
        expenseDate: NOW,
        splitType: 'equal',
        createdBy: USER_ID,
        now: NOW,
      });
      const e2 = createExpense({
        id: asExpenseId('e2'),
        groupId: GROUP_ID,
        title: 'B pays',
        amountMinor: 400,
        currencyCode: CURRENCY,
        expenseDate: NOW,
        splitType: 'equal',
        createdBy: USER_ID,
        now: NOW,
      });
      const D = asMemberId('d');
      const payers: ExpensePayer[] = [
        createExpensePayer({
          id: asExpensePayerId('p1'),
          expenseId: e1.id,
          memberId: A,
          amountMinor: 600,
          now: NOW,
        }),
        createExpensePayer({
          id: asExpensePayerId('p2'),
          expenseId: e2.id,
          memberId: B,
          amountMinor: 400,
          now: NOW,
        }),
      ];
      const splits: ExpenseSplit[] = [
        ...[A, B, C, D].map((m, i) =>
          createExpenseSplit({
            id: asExpenseSplitId(`s1-${i}`),
            expenseId: e1.id,
            memberId: m,
            amountMinor: 150,
            now: NOW,
          }),
        ),
        ...[A, B, C, D].map((m, i) =>
          createExpenseSplit({
            id: asExpenseSplitId(`s2-${i}`),
            expenseId: e2.id,
            memberId: m,
            amountMinor: 100,
            now: NOW,
          }),
        ),
      ];

      const result = calculateGroupBalances({
        groupId: GROUP_ID as string,
        currency: CURRENCY,
        members: [A, B, C, D],
        expenses: [e1, e2],
        payers,
        splits,
        settlements: [],
      });

      expect(result.memberBalances[0]?.netBalanceMinor).toBe(350); // A
      expect(result.memberBalances[1]?.netBalanceMinor).toBe(150); // B
      expect(result.memberBalances[2]?.netBalanceMinor).toBe(-250); // C
      expect(result.memberBalances[3]?.netBalanceMinor).toBe(-250); // D
      expect(result.isBalanced).toBe(true);
    });
  });

  describe('explanations', () => {
    it('produces per-member explanation entries', () => {
      const { expense, payers, splits } = makeExpenseFixture('e1', 1200, A, [
        { member: A, amount: 300 },
        { member: B, amount: 400 },
        { member: C, amount: 500 },
      ]);
      const result = calculateGroupBalances({
        groupId: GROUP_ID as string,
        currency: CURRENCY,
        members: [A, B, C],
        expenses: [expense],
        payers,
        splits,
        settlements: [],
      });

      const aExplanation = result.explanations.get(A as string);
      expect(aExplanation).toBeDefined();
      expect(aExplanation).toHaveLength(1);
      expect(aExplanation?.[0]?.memberPaidMinor).toBe(1200);
      expect(aExplanation?.[0]?.memberShareMinor).toBe(300);
      expect(aExplanation?.[0]?.memberNetForExpenseMinor).toBe(900);
      expect(aExplanation?.[0]?.expenseTitle).toBe('Expense e1');

      const bExplanation = result.explanations.get(B as string);
      expect(bExplanation?.[0]?.memberPaidMinor).toBe(0);
      expect(bExplanation?.[0]?.memberShareMinor).toBe(400);
      expect(bExplanation?.[0]?.memberNetForExpenseMinor).toBe(-400);
    });

    it('explainMemberBalance produces human-readable text', () => {
      const { expense, payers, splits } = makeExpenseFixture('e1', 1200, A, [
        { member: A, amount: 300 },
        { member: B, amount: 400 },
      ]);
      const result = calculateGroupBalances({
        groupId: GROUP_ID as string,
        currency: CURRENCY,
        members: [A, B],
        expenses: [expense],
        payers,
        splits,
        settlements: [],
      });
      const aBalance = result.memberBalances.find((b) => b.memberId === A)!;
      const text = explainMemberBalance(aBalance, 'Alice', CURRENCY);
      expect(text).toContain('Alice paid');
      expect(text).toContain('should receive');
    });

    // v2.5.0 regression: explainMemberBalance previously called
    // net.multiply(-1) for debtors, which Money.rejects (negative
    // factors are invalid) — ANY debtor crashed the explanation path.
    it('explainMemberBalance renders a DEBTOR without crashing', () => {
      const { expense, payers, splits } = makeExpenseFixture('e2', 1200, A, [
        { member: A, amount: 1200 },
        { member: B, amount: 400 },
      ]);
      const result = calculateGroupBalances({
        groupId: GROUP_ID as string,
        currency: CURRENCY,
        members: [A, B],
        expenses: [expense],
        payers,
        splits,
        settlements: [],
      });
      const bBalance = result.memberBalances.find((b) => b.memberId === B)!;
      expect(bBalance.netBalanceMinor).toBeLessThan(0);
      const text = explainMemberBalance(bBalance, 'Bob', CURRENCY);
      expect(text).toContain('Bob owes');
      expect(text).toContain('INR 4.00');
      expect(text).not.toContain('-');
    });
  });

  describe('validation', () => {
    it('rejects empty members list', () => {
      expect(() =>
        calculateGroupBalances({
          groupId: 'g1',
          currency: CURRENCY,
          members: [],
          expenses: [],
          payers: [],
          splits: [],
          settlements: [],
        }),
      ).toThrow();
    });

    it('rejects duplicate members', () => {
      expect(() =>
        calculateGroupBalances({
          groupId: 'g1',
          currency: CURRENCY,
          members: [A, A],
          expenses: [],
          payers: [],
          splits: [],
          settlements: [],
        }),
      ).toThrow();
    });

    it('rejects expense with mismatched currency', () => {
      const expense: Expense = {
        ...makeExpenseFixture('e1', 100, A, [{ member: A, amount: 100 }]).expense,
        currencyCode: asCurrencyCode('USD'),
      };
      expect(() =>
        calculateGroupBalances({
          groupId: 'g1',
          currency: CURRENCY,
          members: [A],
          expenses: [expense],
          payers: [],
          splits: [],
          settlements: [],
        }),
      ).toThrow();
    });
  });

  describe('rounding remainders', () => {
    it('handles ₹10 split 3 ways (1000 / 3 = 334/333/333)', () => {
      const { expense, payers, splits } = makeExpenseFixture('e1', 1000, A, [
        { member: A, amount: 334 },
        { member: B, amount: 333 },
        { member: C, amount: 333 },
      ]);
      const result = calculateGroupBalances({
        groupId: GROUP_ID as string,
        currency: CURRENCY,
        members: [A, B, C],
        expenses: [expense],
        payers,
        splits,
        settlements: [],
      });
      // A: 1000 - 334 = +666, B: -333, C: -333. Σ = 0.
      expect(result.isBalanced).toBe(true);
    });
  });

  describe('removed members (historical integrity)', () => {
    it('historical expenses with unknown members are skipped, not crashed', () => {
      const { expense, payers, splits } = makeExpenseFixture('e1', 1200, A, [
        { member: A, amount: 300 },
        { member: B, amount: 400 },
        { member: C, amount: 500 },
      ]);
      // Pass only [A, B] as current members — C has "left" the group.
      const result = calculateGroupBalances({
        groupId: GROUP_ID as string,
        currency: CURRENCY,
        members: [A, B],
        expenses: [expense],
        payers,
        splits,
        settlements: [],
      });
      // A's balance should still be 900 (paid 1200 - share 300).
      // B's balance should still be -400.
      // C's share is NOT counted (no entry in members) — so Σ is not 0.
      expect(result.memberBalances[0]?.netBalanceMinor).toBe(900);
      expect(result.memberBalances[1]?.netBalanceMinor).toBe(-400);
      // Σ is 500 (the amount C owed) — not balanced because C is not in the active set.
      expect(result.isBalanced).toBe(false);
    });
  });

  describe('soft-deleted payers and splits', () => {
    it('excludes soft-deleted payers from balance calculations', () => {
      // Expense: total 1000.
      // A is the active payer for 1000.
      // B is a soft-deleted payer for 1000 (e.g. an accidental duplicate).
      // Without soft-delete filtering, B's contribution would double-count
      // and break the per-expense payer total invariant. With filtering,
      // only A's 1000 counts.
      const expense = createExpense({
        id: asExpenseId('e1'),
        groupId: GROUP_ID,
        title: 'Test',
        amountMinor: 1000,
        currencyCode: CURRENCY,
        expenseDate: NOW,
        splitType: 'equal',
        createdBy: USER_ID,
        now: NOW,
      });
      const activePayer = createExpensePayer({
        id: asExpensePayerId('p-active'),
        expenseId: expense.id,
        memberId: A,
        amountMinor: 1000,
        now: NOW,
      });
      const deletedPayer = softDeleteExpensePayer(
        createExpensePayer({
          id: asExpensePayerId('p-deleted'),
          expenseId: expense.id,
          memberId: B,
          amountMinor: 1000,
          now: NOW,
        }),
        { now: NOW, expectedVersion: 1 as never },
      );
      const splits: ExpenseSplit[] = [
        createExpenseSplit({
          id: asExpenseSplitId('s1'),
          expenseId: expense.id,
          memberId: A,
          amountMinor: 500,
          now: NOW,
        }),
        createExpenseSplit({
          id: asExpenseSplitId('s2'),
          expenseId: expense.id,
          memberId: B,
          amountMinor: 500,
          now: NOW,
        }),
      ];

      const result = calculateGroupBalances({
        groupId: GROUP_ID as string,
        currency: CURRENCY,
        members: [A, B],
        expenses: [expense],
        payers: [activePayer, deletedPayer],
        splits,
        settlements: [],
      });

      // A: paid 1000 (active), share 500 → +500
      // B: paid 0 (soft-deleted payer excluded), share 500 → -500
      expect(result.memberBalances[0]?.paidMinor).toBe(1000);
      expect(result.memberBalances[1]?.paidMinor).toBe(0);
      expect(result.isBalanced).toBe(true);
      // No payer_total_mismatch diagnostic because the soft-deleted payer's
      // amount is excluded from the sum (1000 = 1000).
      expect(result.diagnostics).toHaveLength(0);
    });

    it('excludes soft-deleted splits from balance calculations', () => {
      // Expense: total 1000.
      // A pays 1000.
      // Splits: A=500 (active), B=500 (soft-deleted duplicate that was
      // replaced). Without filtering, B's share would be double-counted.
      const expense = createExpense({
        id: asExpenseId('e1'),
        groupId: GROUP_ID,
        title: 'Test',
        amountMinor: 1000,
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
          amountMinor: 1000,
          now: NOW,
        }),
      ];
      const activeSplit = createExpenseSplit({
        id: asExpenseSplitId('s-active'),
        expenseId: expense.id,
        memberId: A,
        amountMinor: 500,
        now: NOW,
      });
      const deletedSplit = softDeleteExpenseSplit(
        createExpenseSplit({
          id: asExpenseSplitId('s-deleted'),
          expenseId: expense.id,
          memberId: B,
          amountMinor: 500,
          now: NOW,
        }),
        { now: NOW, expectedVersion: 1 as never },
      );
      // An additional active split for B (the replacement) so totals work.
      const replacementSplit = createExpenseSplit({
        id: asExpenseSplitId('s-replacement'),
        expenseId: expense.id,
        memberId: B,
        amountMinor: 500,
        now: NOW,
      });

      const result = calculateGroupBalances({
        groupId: GROUP_ID as string,
        currency: CURRENCY,
        members: [A, B],
        expenses: [expense],
        payers,
        splits: [activeSplit, deletedSplit, replacementSplit],
        settlements: [],
      });

      // A: paid 1000, share 500 → +500
      // B: paid 0, share 500 (only the replacement counts) → -500
      expect(result.memberBalances[0]?.shareMinor).toBe(500);
      expect(result.memberBalances[1]?.shareMinor).toBe(500);
      expect(result.isBalanced).toBe(true);
      // No split_total_mismatch diagnostic because the soft-deleted split's
      // amount is excluded (500 + 500 = 1000).
      expect(result.diagnostics).toHaveLength(0);
    });
  });
});
