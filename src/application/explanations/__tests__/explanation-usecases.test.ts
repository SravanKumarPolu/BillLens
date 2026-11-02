import { beforeEach, describe, expect, it } from '@jest/globals';

import {
  InMemoryBalanceQueryPort,
  type BalanceQueryResult,
} from '@application/balances/balance-query.port';
import {
  asExpenseId,
  asExpensePayerId,
  asExpenseSplitId,
  asGroupId,
  asMemberId,
  asUserId,
  createExpense,
  createExpensePayer,
  createExpenseSplit,
  type Expense,
  type ExpensePayer,
  type ExpenseSplit,
} from '@domain/entities';
import { asDateTime } from '@domain/value-objects';
import type { GroupId, MemberId } from '@shared-types/index';

import {
  CompareOriginalAndSimplifiedPlanUseCase,
  ExplainMemberDebtUseCase,
  ExplainMemberCreditUseCase,
  GenerateSettlementSuggestionsUseCase,
  GetSuggestedTransferExplanationUseCase,
  PreviewSettlementImpactUseCase,
} from '../index';

// ── Fixtures ────────────────────────────────────────────────────────
const NOW = asDateTime('2026-07-29T10:00:00.000Z');
const USER_ID = asUserId('user-1');
const GROUP_ID = asGroupId('group-1');
const A = asMemberId('a');
const B = asMemberId('b');
const C = asMemberId('c');

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

function seedPort(
  port: InMemoryBalanceQueryPort,
  groupId: GroupId,
  expenses: readonly { expense: Expense; payers: ExpensePayer[]; splits: ExpenseSplit[] }[],
  members: MemberId[] = [A, B, C],
): void {
  const data: BalanceQueryResult = {
    members: members.map((id) => ({
      id,
      groupId,
      displayName: `Member ${id as string}` as never,
      role: 'member' as const,
      joinedAt: NOW,
      updatedAt: NOW,
      version: 1 as never,
    })),
    expenses: expenses.map((e) => e.expense),
    payers: expenses.flatMap((e) => e.payers),
    splits: expenses.flatMap((e) => e.splits),
    settlements: [],
  };
  port.seed(groupId, data);
}

// ── Tests ──────────────────────────────────────────────────────────

describe('Phase 6 Track 2 — Explanation engine (Prompt 55)', () => {
  let port: InMemoryBalanceQueryPort;

  beforeEach(() => {
    port = new InMemoryBalanceQueryPort();
  });

  // ── GenerateSettlementSuggestionsUseCase ──────────────────

  describe('GenerateSettlementSuggestionsUseCase', () => {
    it('returns suggested transfers per currency with reason codes', async () => {
      const e = makeExpense('e1', 'INR', 1200, A, [
        { member: A, amount: 400 },
        { member: B, amount: 400 },
        { member: C, amount: 400 },
      ]);
      seedPort(port, GROUP_ID, [e]);
      const useCase = new GenerateSettlementSuggestionsUseCase(port);
      const result = await useCase.execute({ groupId: GROUP_ID });
      expect(result.notFound).toBe(false);
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0]?.currencyCode).toBe('INR');
      expect(result.suggestions[0]?.transfers.length).toBeGreaterThan(0);
      // B and C both owe A — direct debts (A paid for the expense they share)
      for (const t of result.suggestions[0]!.transfers) {
        expect(t.reasonCode).toBe('direct_debt');
      }
    });

    it('returns notFound=true for unknown groups', async () => {
      const useCase = new GenerateSettlementSuggestionsUseCase(port);
      const result = await useCase.execute({ groupId: GROUP_ID });
      expect(result.notFound).toBe(true);
    });
  });

  // ── PreviewSettlementImpactUseCase ─────────────────────────

  describe('PreviewSettlementImpactUseCase', () => {
    it('shows before/after balances for a partial settlement', async () => {
      // A pays ₹1200, A/B/C split 400/400/400
      // A net = +800, B net = -400, C net = -400
      const e = makeExpense('e1', 'INR', 1200, A, [
        { member: A, amount: 400 },
        { member: B, amount: 400 },
        { member: C, amount: 400 },
      ]);
      seedPort(port, GROUP_ID, [e]);
      const useCase = new PreviewSettlementImpactUseCase(port);
      const result = await useCase.execute({
        groupId: GROUP_ID,
        payerMemberId: B,
        receiverMemberId: A,
        currencyCode: 'INR',
        amountMinor: 200, // partial: B owes 400, pays 200
      });
      expect(result.notFound).toBe(false);
      expect(result.previews).toHaveLength(1);
      const p = result.previews[0]!;
      expect(p.payerBefore).toBe(-400);
      expect(p.receiverBefore).toBe(800);
      expect(p.payerAfter).toBe(-200); // -400 + 200 = -200 (still owes 200)
      expect(p.receiverAfter).toBe(600); // 800 - 200 = 600
      expect(p.isFullSettlement).toBe(false);
      expect(p.isPartial).toBe(true);
      expect(p.isOverpayment).toBe(false);
    });

    it('marks a full settlement correctly', async () => {
      const e = makeExpense('e1', 'INR', 1200, A, [
        { member: A, amount: 800 },
        { member: B, amount: 400 },
      ]);
      seedPort(port, GROUP_ID, [e], [A, B]);
      const useCase = new PreviewSettlementImpactUseCase(port);
      const result = await useCase.execute({
        groupId: GROUP_ID,
        payerMemberId: B,
        receiverMemberId: A,
        currencyCode: 'INR',
        amountMinor: 400, // full: B owes exactly 400
      });
      const p = result.previews[0]!;
      expect(p.isFullSettlement).toBe(true);
      expect(p.payerAfter).toBe(0);
      expect(p.receiverAfter).toBe(0);
    });

    it('marks an overpayment correctly', async () => {
      const e = makeExpense('e1', 'INR', 1200, A, [
        { member: A, amount: 800 },
        { member: B, amount: 400 },
      ]);
      seedPort(port, GROUP_ID, [e], [A, B]);
      const useCase = new PreviewSettlementImpactUseCase(port);
      const result = await useCase.execute({
        groupId: GROUP_ID,
        payerMemberId: B,
        receiverMemberId: A,
        currencyCode: 'INR',
        amountMinor: 600, // overpayment: B owes 400, pays 600
      });
      const p = result.previews[0]!;
      expect(p.isOverpayment).toBe(true);
    });
  });

  // ── ExplainMemberDebtUseCase ───────────────────────────────

  describe('ExplainMemberDebtUseCase', () => {
    it('returns the per-expense breakdown for a debtor', async () => {
      const e = makeExpense('e1', 'INR', 1200, A, [
        { member: A, amount: 400 },
        { member: B, amount: 400 },
        { member: C, amount: 400 },
      ]);
      seedPort(port, GROUP_ID, [e]);
      const useCase = new ExplainMemberDebtUseCase(port);
      const result = await useCase.execute({
        groupId: GROUP_ID,
        memberId: B,
      });
      expect(result.notFound).toBe(false);
      expect(result.breakdowns).toHaveLength(1);
      const bd = result.breakdowns[0]!;
      expect(bd.owes).toBe(true); // B owes money
      expect(bd.owesMinor).toBe(400);
      expect(bd.expenseEntries).toHaveLength(1);
      expect(bd.expenseEntries[0]?.expenseTitle).toBe('Expense e1');
      expect(bd.expenseEntries[0]?.memberShareMinor).toBe(400);
      expect(bd.expenseEntries[0]?.memberPaidMinor).toBe(0); // B didn't pay
    });
  });

  // ── ExplainMemberCreditUseCase ────────────────────────────

  describe('ExplainMemberCreditUseCase', () => {
    it('returns only currencies where the member should receive', async () => {
      const e = makeExpense('e1', 'INR', 1200, A, [
        { member: A, amount: 400 },
        { member: B, amount: 400 },
        { member: C, amount: 400 },
      ]);
      seedPort(port, GROUP_ID, [e]);
      const useCase = new ExplainMemberCreditUseCase(port);
      const result = await useCase.execute({
        groupId: GROUP_ID,
        memberId: A, // A is owed money
      });
      expect(result.notFound).toBe(false);
      expect(result.breakdowns).toHaveLength(1);
      expect(result.breakdowns[0]?.owes).toBe(false); // A should receive
    });
  });

  // ── GetSuggestedTransferExplanationUseCase ───────────────

  describe('GetSuggestedTransferExplanationUseCase', () => {
    it('produces a direct-debt explanation with before/after', async () => {
      const e = makeExpense('e1', 'INR', 1200, A, [
        { member: A, amount: 400 },
        { member: B, amount: 400 },
        { member: C, amount: 400 },
      ]);
      seedPort(port, GROUP_ID, [e]);
      const useCase = new GetSuggestedTransferExplanationUseCase(port);
      const result = await useCase.execute({
        groupId: GROUP_ID,
        fromMemberId: B,
        toMemberId: A,
        currencyCode: 'INR',
        amountMinor: 400,
        fromMemberName: 'Bob',
        toMemberName: 'Alice',
      });
      expect(result.notFound).toBe(false);
      expect(result.explanation).not.toBeNull();
      const exp = result.explanation!;
      expect(exp.reasonCode).toBe('direct_debt');
      expect(exp.fromBefore).toBe(-400);
      expect(exp.toBefore).toBe(800);
      expect(exp.fromAfter).toBe(0);
      expect(exp.toAfter).toBe(400);
      expect(exp.isFull).toBe(false); // B is fully settled but A still has C's debt
      expect(exp.message).toContain('Alice'); // the receiver's name is in the message
    });
  });

  // ── CompareOriginalAndSimplifiedPlanUseCase ───────────────

  describe('CompareOriginalAndSimplifiedPlanUseCase', () => {
    it('shows the transfer savings from simplification', async () => {
      // 3 members: A owes 400, B owes 400, C receives 800
      // Without simplification: 2 debtors × 1 creditor = 2 transfers
      // With simplification: greedy also produces 2 transfers (each debtor → C)
      const e = makeExpense('e1', 'INR', 1200, C, [
        { member: A, amount: 400 },
        { member: B, amount: 400 },
        { member: C, amount: 400 },
      ]);
      seedPort(port, GROUP_ID, [e]);
      const useCase = new CompareOriginalAndSimplifiedPlanUseCase(port);
      const result = await useCase.execute({ groupId: GROUP_ID });
      expect(result.notFound).toBe(false);
      expect(result.comparisons).toHaveLength(1);
      const cmp = result.comparisons[0]!;
      expect(cmp.currencyCode).toBe('INR');
      expect(cmp.originalTransferCount).toBeGreaterThanOrEqual(cmp.simplifiedTransferCount);
      expect(cmp.simplifiedTransferCount).toBeGreaterThan(0);
      expect(cmp.membersInvolved).toHaveLength(3);
    });
  });
});
