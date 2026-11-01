import { beforeEach, describe, expect, it } from '@jest/globals';

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
  createGroupMember,
  createSettlement,
  type Expense,
  type ExpensePayer,
  type ExpenseSplit,
  type GroupMember,
  type Settlement,
} from '@domain/entities';
import { asDateTime } from '@domain/value-objects';
import type { GroupId, MemberId } from '@shared-types/index';

import {
  GetBalanceBreakdownUseCase,
  GetGroupBalancesUseCase,
  GetGroupCurrencySummariesUseCase,
  GetMemberBalanceUseCase,
  GetUnsettledMembersUseCase,
  InMemoryBalanceQueryPort,
  RecalculateGroupBalancesUseCase,
  ValidateBalanceInvariantsUseCase,
  type BalanceQueryResult,
} from '../index';

// ── Fixtures ────────────────────────────────────────────────────────
const NOW = asDateTime('2026-07-29T10:00:00.000Z');
const USER_ID = asUserId('user-1');
const GROUP_ID = asGroupId('group-1');

const A = asMemberId('a');
const B = asMemberId('b');
const C = asMemberId('c');

function makeMember(id: MemberId): GroupMember {
  return createGroupMember({
    id,
    groupId: GROUP_ID,
    displayName: `Member ${id as string}`,
    role: 'member',
    now: NOW,
  });
}

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
 * Helper: build a BalanceQueryResult for a group, seeded into the
 * InMemoryBalanceQueryPort.
 */
function seedPort(
  port: InMemoryBalanceQueryPort,
  groupId: GroupId,
  data: {
    members?: readonly MemberId[];
    expenses?: readonly { expense: Expense; payers: ExpensePayer[]; splits: ExpenseSplit[] }[];
    settlements?: readonly Settlement[];
  },
): void {
  const result: BalanceQueryResult = {
    members: (data.members ?? [A, B]).map(makeMember),
    expenses: (data.expenses ?? []).map((e) => e.expense),
    payers: (data.expenses ?? []).flatMap((e) => e.payers),
    splits: (data.expenses ?? []).flatMap((e) => e.splits),
    settlements: data.settlements ?? [],
  };
  port.seed(groupId, result);
}

// ── Tests ──────────────────────────────────────────────────────────

describe('Phase 6 Track 3 — Prompt 51 balance use cases', () => {
  let port: InMemoryBalanceQueryPort;
  let getGroupBalances: GetGroupBalancesUseCase;

  beforeEach(() => {
    port = new InMemoryBalanceQueryPort();
    getGroupBalances = new GetGroupBalancesUseCase(port);
  });

  // ── GetGroupBalancesUseCase ────────────────────────────────────

  describe('GetGroupBalancesUseCase', () => {
    it('returns per-currency results for a multi-currency group', async () => {
      const gbp = makeExpense('e-gbp', 'GBP', 6000, A, [
        { member: A, amount: 3000 },
        { member: B, amount: 3000 },
      ]);
      const inr = makeExpense('e-inr', 'INR', 4000, B, [
        { member: A, amount: 2000 },
        { member: B, amount: 2000 },
      ]);
      seedPort(port, GROUP_ID, {
        members: [A, B],
        expenses: [gbp, inr],
      });
      const result = await getGroupBalances.execute({ groupId: GROUP_ID });
      expect(result.notFound).toBe(false);
      expect(result.results).toHaveLength(2);
      expect(result.results[0]?.currencyCode).toBe('GBP');
      expect(result.results[1]?.currencyCode).toBe('INR');
    });

    it('returns notFound=true for an unknown group', async () => {
      const result = await getGroupBalances.execute({ groupId: GROUP_ID });
      expect(result.notFound).toBe(true);
      expect(result.results).toEqual([]);
    });

    it('returns empty results when there are no expenses and no settlements', async () => {
      seedPort(port, GROUP_ID, { members: [A, B] });
      const result = await getGroupBalances.execute({ groupId: GROUP_ID });
      expect(result.notFound).toBe(false);
      expect(result.results).toEqual([]);
    });
  });

  // ── GetMemberBalanceUseCase ──────────────────────────────────

  describe('GetMemberBalanceUseCase', () => {
    it('returns the member\'s per-currency balances', async () => {
      const gbp = makeExpense('e-gbp', 'GBP', 6000, A, [
        { member: A, amount: 3000 },
        { member: B, amount: 3000 },
      ]);
      const inr = makeExpense('e-inr', 'INR', 4000, B, [
        { member: A, amount: 2000 },
        { member: B, amount: 2000 },
      ]);
      seedPort(port, GROUP_ID, {
        members: [A, B],
        expenses: [gbp, inr],
      });
      const useCase = new GetMemberBalanceUseCase(getGroupBalances);
      const result = await useCase.execute({
        groupId: GROUP_ID,
        memberId: A,
      });
      expect(result.notFound).toBe(false);
      expect(result.balances).toHaveLength(2);
      const gbpBalance = result.balances.find((b) => b.currencyCode === 'GBP');
      const inrBalance = result.balances.find((b) => b.currencyCode === 'INR');
      expect(gbpBalance?.netBalanceMinor).toBe(3000); // A is owed £30
      expect(inrBalance?.netBalanceMinor).toBe(-2000); // A owes ₹20
    });

    it('returns balances for the member across every currency (zero balances included)', async () => {
      // The balance engine includes every member of the group in every
      // currency result, even if their balance is zero. So a member
      // with no expense activity still gets a zero-balance entry per
      // currency the group has activity in.
      const gbp = makeExpense('e-gbp', 'GBP', 6000, A, [
        { member: A, amount: 3000 },
        { member: B, amount: 3000 },
      ]);
      seedPort(port, GROUP_ID, {
        members: [A, B, C],
        expenses: [gbp],
      });
      const useCase = new GetMemberBalanceUseCase(getGroupBalances);
      const result = await useCase.execute({
        groupId: GROUP_ID,
        memberId: C,
      });
      expect(result.balances).toHaveLength(1); // one per currency (GBP only)
      expect(result.balances[0]?.currencyCode).toBe('GBP');
      expect(result.balances[0]?.netBalanceMinor).toBe(0);
      expect(result.balances[0]?.expenseCount).toBe(0);
    });
  });

  // ── GetBalanceBreakdownUseCase ───────────────────────────────

  describe('GetBalanceBreakdownUseCase', () => {
    it('returns per-expense breakdown for the member, grouped by currency', async () => {
      const gbp = makeExpense('e-gbp', 'GBP', 6000, A, [
        { member: A, amount: 3000 },
        { member: B, amount: 3000 },
      ]);
      const inr = makeExpense('e-inr', 'INR', 4000, B, [
        { member: A, amount: 2000 },
        { member: B, amount: 2000 },
      ]);
      seedPort(port, GROUP_ID, {
        members: [A, B],
        expenses: [gbp, inr],
      });
      const useCase = new GetBalanceBreakdownUseCase(getGroupBalances);
      const result = await useCase.execute({
        groupId: GROUP_ID,
        memberId: A,
      });
      expect(result.notFound).toBe(false);
      expect(result.breakdowns).toHaveLength(2);
      const gbpBreakdown = result.breakdowns.find((b) => b.currencyCode === 'GBP');
      expect(gbpBreakdown?.entries).toHaveLength(1);
      expect(gbpBreakdown?.entries[0]?.expenseId).toBe('e-gbp');
      expect(gbpBreakdown?.entries[0]?.memberPaidMinor).toBe(6000);
      expect(gbpBreakdown?.entries[0]?.memberShareMinor).toBe(3000);
    });
  });

  // ── GetGroupCurrencySummariesUseCase ───────────────────────────

  describe('GetGroupCurrencySummariesUseCase', () => {
    it('returns one summary per currency with counts and balanced flag', async () => {
      const gbpE = makeExpense('e-gbp', 'GBP', 6000, A, [
        { member: A, amount: 3000 },
        { member: B, amount: 3000 },
      ]);
      const inrE = makeExpense('e-inr', 'INR', 4000, B, [
        { member: A, amount: 2000 },
        { member: B, amount: 2000 },
      ]);
      seedPort(port, GROUP_ID, {
        members: [A, B],
        expenses: [gbpE, inrE],
      });
      const useCase = new GetGroupCurrencySummariesUseCase(getGroupBalances);
      const result = await useCase.execute({ groupId: GROUP_ID });
      expect(result.notFound).toBe(false);
      expect(result.summaries).toHaveLength(2);
      const gbpSummary = result.summaries.find((s) => s.currencyCode === 'GBP');
      expect(gbpSummary?.nonZeroMemberCount).toBe(2); // A and B both have non-zero
      expect(gbpSummary?.isBalanced).toBe(true);
    });
  });

  // ── GetUnsettledMembersUseCase ────────────────────────────────

  describe('GetUnsettledMembersUseCase', () => {
    it('returns members with non-zero balances, with their position', async () => {
      const gbp = makeExpense('e-gbp', 'GBP', 6000, A, [
        { member: A, amount: 3000 },
        { member: B, amount: 3000 },
      ]);
      const inr = makeExpense('e-inr', 'INR', 4000, B, [
        { member: A, amount: 2000 },
        { member: B, amount: 2000 },
      ]);
      seedPort(port, GROUP_ID, {
        members: [A, B],
        expenses: [gbp, inr],
      });
      const useCase = new GetUnsettledMembersUseCase(getGroupBalances);
      const result = await useCase.execute({ groupId: GROUP_ID });
      expect(result.notFound).toBe(false);
      // 2 currencies × 2 members with non-zero balances = 4 entries
      expect(result.entries).toHaveLength(4);
      const aGbp = result.entries.find(
        (e) => e.memberId === A && e.currencyCode === 'GBP',
      );
      expect(aGbp?.position).toBe('creditor'); // A is owed £30
      expect(aGbp?.netBalanceMinor).toBe(3000);
      const aInr = result.entries.find(
        (e) => e.memberId === A && e.currencyCode === 'INR',
      );
      expect(aInr?.position).toBe('debtor'); // A owes ₹20
    });

    it('excludes settled members', async () => {
      // Settle the GBP balance with a £30 settlement
      const gbp = makeExpense('e-gbp', 'GBP', 6000, A, [
        { member: A, amount: 3000 },
        { member: B, amount: 3000 },
      ]);
      const settle = makeSettlement('s1', 'GBP', B, A, 3000);
      seedPort(port, GROUP_ID, {
        members: [A, B],
        expenses: [gbp],
        settlements: [settle],
      });
      const useCase = new GetUnsettledMembersUseCase(getGroupBalances);
      const result = await useCase.execute({ groupId: GROUP_ID });
      expect(result.entries).toEqual([]);
    });
  });

  // ── RecalculateGroupBalancesUseCase ──────────────────────────

  describe('RecalculateGroupBalancesUseCase', () => {
    it('returns the same shape as GetGroupBalancesUseCase', async () => {
      const gbp = makeExpense('e-gbp', 'GBP', 6000, A, [
        { member: A, amount: 3000 },
        { member: B, amount: 3000 },
      ]);
      seedPort(port, GROUP_ID, {
        members: [A, B],
        expenses: [gbp],
      });
      const useCase = new RecalculateGroupBalancesUseCase(getGroupBalances);
      const result = await useCase.execute({ groupId: GROUP_ID });
      expect(result.notFound).toBe(false);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.currencyCode).toBe('GBP');
    });

    it('is idempotent — calling twice produces the same balances', async () => {
      const gbp = makeExpense('e-gbp', 'GBP', 6000, A, [
        { member: A, amount: 3000 },
        { member: B, amount: 3000 },
      ]);
      seedPort(port, GROUP_ID, {
        members: [A, B],
        expenses: [gbp],
      });
      const useCase = new RecalculateGroupBalancesUseCase(getGroupBalances);
      const r1 = await useCase.execute({ groupId: GROUP_ID });
      const r2 = await useCase.execute({ groupId: GROUP_ID });
      // sourceVersion should be the same (no input change between calls)
      expect(r1.results[0]?.sourceVersion).toBe(r2.results[0]?.sourceVersion);
      // Balances should be identical
      expect(r1.results[0]?.memberCurrencyBalances).toEqual(
        r2.results[0]?.memberCurrencyBalances,
      );
    });
  });

  // ── ValidateBalanceInvariantsUseCase ────────────────────────

  describe('ValidateBalanceInvariantsUseCase', () => {
    it('returns no failures when every currency balances', async () => {
      const gbp = makeExpense('e-gbp', 'GBP', 6000, A, [
        { member: A, amount: 3000 },
        { member: B, amount: 3000 },
      ]);
      const inr = makeExpense('e-inr', 'INR', 4000, B, [
        { member: A, amount: 2000 },
        { member: B, amount: 2000 },
      ]);
      seedPort(port, GROUP_ID, {
        members: [A, B],
        expenses: [gbp, inr],
      });
      const useCase = new ValidateBalanceInvariantsUseCase(getGroupBalances);
      const result = await useCase.execute({ groupId: GROUP_ID });
      expect(result.notFound).toBe(false);
      expect(result.failures).toEqual([]);
    });

    it('returns a failure when a currency does not balance', async () => {
      // Construct a corrupted INR result: B is owed ₹20 but no one owes
      // it back (we remove A from the members list — A's share is "lost").
      const inr = makeExpense('e-inr', 'INR', 4000, B, [
        { member: A, amount: 2000 },
        { member: B, amount: 2000 },
      ]);
      seedPort(port, GROUP_ID, {
        members: [B], // A is missing — incomplete_membership
        expenses: [inr],
      });
      const useCase = new ValidateBalanceInvariantsUseCase(getGroupBalances);
      const result = await useCase.execute({ groupId: GROUP_ID });
      expect(result.failures.length).toBeGreaterThan(0);
      expect(result.failures[0]?.currencyCode).toBe('INR');
      expect(result.failures[0]?.validationStatus).not.toBe('balanced');
    });
  });
});
