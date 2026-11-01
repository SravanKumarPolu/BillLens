/**
 * Balance-explanation view-model unit tests (Prompt 19).
 *
 * Covers the pure projection logic in
 * `src/presentation/view-models/balance-explanation.ts`:
 *   - createBalanceExplanationViewModel (creditor / debtor / settled)
 *   - summaryLabelFor / buildSummaryText
 *   - createSettlementPreviewViewModel (before / after balances)
 *   - createEmptyBalanceExplanation / createEmptySettlementPreview
 *   - buildDefaultReason
 *
 * Pure logic — no rendering, no React, no stores.
 */

import { describe, expect, it } from '@jest/globals';

import type {
  BalanceExplanation,
  ExpenseContribution,
  RoundingExplanation,
  SettlementExplanation,
} from '@domain/explanations/explanation-types';
import {
  buildDefaultReason,
  buildSummaryText,
  createBalanceExplanationViewModel,
  createEmptyBalanceExplanation,
  createEmptySettlementPreview,
  createSettlementPreviewViewModel,
  summaryLabelFor,
} from '@presentation/view-models/balance-explanation';
import type { MemberId } from '@shared-types/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const A: MemberId = 'm_a' as MemberId;
const B: MemberId = 'm_b' as MemberId;
const C: MemberId = 'm_c' as MemberId;

function makeBalance(overrides: Partial<BalanceExplanation> = {}): BalanceExplanation {
  return {
    memberId: A,
    paidMinor: 0,
    shareMinor: 0,
    settlementsSentMinor: 0,
    settlementsReceivedMinor: 0,
    netBalanceMinor: 0,
    expenseContributions: [],
    settlementImpact: [],
    roundingNotes: [],
    summaryKey: 'settled',
    summaryText: 'A is settled.',
    ...overrides,
  };
}

function makeContribution(overrides: Partial<ExpenseContribution> = {}): ExpenseContribution {
  return {
    expenseId: 'e_1',
    expenseTitle: 'Dinner',
    paidByMemberId: A,
    memberPaidMinor: 1000,
    memberShareMinor: 400,
    memberNetForExpenseMinor: 600,
    expenseDate: '2026-07-29',
    ...overrides,
  };
}

function makeSettlementImpact(overrides: Partial<SettlementExplanation> = {}): SettlementExplanation {
  return {
    settlementId: 's_1',
    fromMemberId: A,
    toMemberId: B,
    amountMinor: 200,
    date: '2026-07-29',
    impactOnMember: 'reduced_debt',
    ...overrides,
  };
}

function makeRoundingNote(overrides: Partial<RoundingExplanation> = {}): RoundingExplanation {
  return {
    expenseId: 'e_1',
    totalAmountMinor: 1000,
    splitSumMinor: 999,
    remainderMinor: 1,
    distributionMethod: 'earliest_indices',
    membersReceivingExtra: [A],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// summaryLabelFor
// ---------------------------------------------------------------------------

describe('summaryLabelFor', () => {
  it('returns "You are owed" for creditors', () => {
    expect(summaryLabelFor('creditor')).toBe('You are owed');
  });

  it('returns "You owe" for debtors', () => {
    expect(summaryLabelFor('debtor')).toBe('You owe');
  });

  it('returns "Settled" for settled members', () => {
    expect(summaryLabelFor('settled')).toBe('Settled');
  });
});

// ---------------------------------------------------------------------------
// buildSummaryText
// ---------------------------------------------------------------------------

describe('buildSummaryText', () => {
  it('builds the creditor formula (paid − share + received − sent = owed)', () => {
    const explanation = makeBalance({
      paidMinor: 1200,
      shareMinor: 300,
      settlementsReceivedMinor: 200,
      settlementsSentMinor: 0,
      netBalanceMinor: 900,
      summaryKey: 'creditor',
    });
    const text = buildSummaryText('creditor', 'A', explanation, 'INR');

    expect(text).toContain('Paid: INR 12.00');
    expect(text).toContain("− A's share: INR 3.00");
    expect(text).toContain('+ Received: INR 2.00');
    expect(text).toContain('− Sent: INR 0.00');
    expect(text).toContain('A is owed: INR 9.00');
  });

  it('builds the debtor formula (negative balance)', () => {
    const explanation = makeBalance({
      paidMinor: 0,
      shareMinor: 500,
      settlementsReceivedMinor: 0,
      settlementsSentMinor: 0,
      netBalanceMinor: -500,
      summaryKey: 'debtor',
    });
    const text = buildSummaryText('debtor', 'B', explanation, 'USD');

    expect(text).toContain('Paid: USD 0.00');
    expect(text).toContain("− B's share: USD 5.00");
    expect(text).toContain('= B owes: USD 5.00');
  });

  it('builds the settled formula (zero balance)', () => {
    const explanation = makeBalance({
      paidMinor: 300,
      shareMinor: 300,
      netBalanceMinor: 0,
      summaryKey: 'settled',
    });
    const text = buildSummaryText('settled', 'C', explanation, 'USD');

    expect(text).toContain('Paid: USD 3.00');
    expect(text).toContain("− C's share: USD 3.00");
    expect(text).toContain('C is settled');
  });
});

// ---------------------------------------------------------------------------
// createBalanceExplanationViewModel — full projection
// ---------------------------------------------------------------------------

describe('createBalanceExplanationViewModel', () => {
  describe('creditor case', () => {
    it('produces a "You are owed" view model with positive net balance', () => {
      const explanation = makeBalance({
        paidMinor: 1200,
        shareMinor: 300,
        netBalanceMinor: 900,
        summaryKey: 'creditor',
      });
      const vm = createBalanceExplanationViewModel({
        explanation,
        memberName: 'Priya',
        currencyCode: 'INR',
      });

      expect(vm.memberName).toBe('Priya');
      expect(vm.netBalanceMinor).toBe(900);
      expect(vm.summaryKey).toBe('creditor');
      expect(vm.summaryLabel).toBe('You are owed');
      expect(vm.currencyCode).toBe('INR');
      expect(vm.hasContributions).toBe(false);
      expect(vm.hasSettlementImpacts).toBe(false);
      expect(vm.hasRoundingNotes).toBe(false);
    });
  });

  describe('debtor case', () => {
    it('produces a "You owe" view model with negative net balance', () => {
      const explanation = makeBalance({
        paidMinor: 0,
        shareMinor: 500,
        netBalanceMinor: -500,
        summaryKey: 'debtor',
      });
      const vm = createBalanceExplanationViewModel({
        explanation,
        memberName: 'Sam',
        currencyCode: 'USD',
      });

      expect(vm.netBalanceMinor).toBe(-500);
      expect(vm.summaryKey).toBe('debtor');
      expect(vm.summaryLabel).toBe('You owe');
    });
  });

  describe('settled case', () => {
    it('produces a "Settled" view model with zero net balance', () => {
      const explanation = makeBalance({ netBalanceMinor: 0, summaryKey: 'settled' });
      const vm = createBalanceExplanationViewModel({
        explanation,
        memberName: 'Pat',
        currencyCode: 'USD',
      });

      expect(vm.netBalanceMinor).toBe(0);
      expect(vm.summaryKey).toBe('settled');
      expect(vm.summaryLabel).toBe('Settled');
    });
  });

  describe('contributions', () => {
    it('maps each contribution with the paid-by id and net', () => {
      const explanation = makeBalance({
        expenseContributions: [
          makeContribution({
            expenseId: 'e_1',
            expenseTitle: 'Dinner',
            memberPaidMinor: 1000,
            memberShareMinor: 400,
            memberNetForExpenseMinor: 600,
          }),
        ],
      });
      const vm = createBalanceExplanationViewModel({
        explanation,
        memberName: 'A',
        currencyCode: 'INR',
      });

      expect(vm.hasContributions).toBe(true);
      expect(vm.contributions).toHaveLength(1);
      expect(vm.contributions[0]?.expenseTitle).toBe('Dinner');
      expect(vm.contributions[0]?.paidByMemberId).toBe(A);
      expect(vm.contributions[0]?.memberNetForExpenseMinor).toBe(600);
    });
  });

  describe('settlement impacts', () => {
    it('marks settlements sent as reduced_debt with the "sent" direction', () => {
      const explanation = makeBalance({
        settlementImpact: [
          makeSettlementImpact({
            fromMemberId: A,
            toMemberId: B,
            impactOnMember: 'reduced_debt',
          }),
        ],
      });
      const vm = createBalanceExplanationViewModel({
        explanation,
        memberName: 'A',
        currencyCode: 'INR',
      });

      expect(vm.hasSettlementImpacts).toBe(true);
      expect(vm.settlementImpacts[0]?.direction).toBe('sent');
      expect(vm.settlementImpacts[0]?.impactLabel).toContain('reduced your debt');
    });

    it('marks settlements received as reduced_credit with the "received" direction', () => {
      const explanation = makeBalance({
        settlementImpact: [
          makeSettlementImpact({
            fromMemberId: B,
            toMemberId: A,
            impactOnMember: 'reduced_credit',
          }),
        ],
      });
      const vm = createBalanceExplanationViewModel({
        explanation,
        memberName: 'A',
        currencyCode: 'INR',
      });

      expect(vm.settlementImpacts[0]?.direction).toBe('received');
      expect(vm.settlementImpacts[0]?.impactLabel).toContain('reduced what you are owed');
    });

    it('uses member names when a memberNames map is provided', () => {
      const explanation = makeBalance({
        settlementImpact: [
          makeSettlementImpact({
            fromMemberId: A,
            toMemberId: B,
            impactOnMember: 'reduced_debt',
          }),
        ],
      });
      const memberNames = new Map<string, string>([
        [A, 'Priya'],
        [B, 'Sam'],
      ]);
      const vm = createBalanceExplanationViewModel({
        explanation,
        memberName: 'Priya',
        currencyCode: 'INR',
        memberNames,
      });

      expect(vm.settlementImpacts[0]?.impactLabel).toContain('Sam');
    });
  });

  describe('rounding notes', () => {
    it('renders a positive-remainder note when splits sum below the total', () => {
      const explanation = makeBalance({
        roundingNotes: [
          makeRoundingNote({
            remainderMinor: 1,
            membersReceivingExtra: [A],
            distributionMethod: 'earliest_indices',
          }),
        ],
      });
      const vm = createBalanceExplanationViewModel({
        explanation,
        memberName: 'A',
        currencyCode: 'INR',
      });

      expect(vm.hasRoundingNotes).toBe(true);
      expect(vm.roundingNotes[0]?.note).toContain('1 minor unit');
      expect(vm.roundingNotes[0]?.note).toContain('added');
      expect(vm.roundingNotes[0]?.note).toContain('earliest_indices');
    });

    it('renders a negative-remainder note when splits sum above the total', () => {
      const explanation = makeBalance({
        roundingNotes: [
          makeRoundingNote({
            remainderMinor: -3,
            membersReceivingExtra: [A, B],
            distributionMethod: 'largest_remainder',
          }),
        ],
      });
      const vm = createBalanceExplanationViewModel({
        explanation,
        memberName: 'A',
        currencyCode: 'INR',
      });

      expect(vm.roundingNotes[0]?.note).toContain('3 minor units');
      expect(vm.roundingNotes[0]?.note).toContain('removed');
    });
  });
});

// ---------------------------------------------------------------------------
// createSettlementPreviewViewModel
// ---------------------------------------------------------------------------

describe('createSettlementPreviewViewModel', () => {
  it('produces before and after balances with the sender increased and recipient decreased', () => {
    const vm = createSettlementPreviewViewModel({
      fromMemberId: A,
      toMemberId: B,
      amountMinor: 300,
      currencyCode: 'INR',
      members: [
        { memberId: A, memberName: 'Priya', balanceMinor: -300 },
        { memberId: B, memberName: 'Sam', balanceMinor: 300 },
        { memberId: C, memberName: 'Pat', balanceMinor: 0 },
      ],
    });

    expect(vm.fromMemberName).toBe('Priya');
    expect(vm.toMemberName).toBe('Sam');
    expect(vm.amountMinor).toBe(300);
    expect(vm.currencyCode).toBe('INR');
    expect(vm.hasBalances).toBe(true);

    const priya = vm.afterBalances.find((b) => b.memberId === (A as string));
    const sam = vm.afterBalances.find((b) => b.memberId === (B as string));
    const pat = vm.afterBalances.find((b) => b.memberId === (C as string));

    expect(priya?.beforeBalanceMinor).toBe(-300);
    expect(priya?.afterBalanceMinor).toBe(0); // -300 + 300 = 0
    expect(priya?.isSender).toBe(true);

    expect(sam?.beforeBalanceMinor).toBe(300);
    expect(sam?.afterBalanceMinor).toBe(0); // 300 - 300 = 0
    expect(sam?.isRecipient).toBe(true);

    expect(pat?.beforeBalanceMinor).toBe(0);
    expect(pat?.afterBalanceMinor).toBe(0); // unchanged
    expect(pat?.isSender).toBe(false);
    expect(pat?.isRecipient).toBe(false);
  });

  it('builds a default reason when none is provided', () => {
    const vm = createSettlementPreviewViewModel({
      fromMemberId: A,
      toMemberId: B,
      amountMinor: 300,
      currencyCode: 'INR',
      members: [
        { memberId: A, memberName: 'Priya', balanceMinor: -300 },
        { memberId: B, memberName: 'Sam', balanceMinor: 300 },
      ],
    });

    expect(vm.reason).toContain('Priya owes Sam');
    // 300 minor units of INR is ₹3.00 — the reason must be speakable,
    // not a raw minor-unit integer (a11y regression guard).
    expect(vm.reason).toContain('₹3.00 INR');
    expect(vm.reason).not.toContain('300');
  });

  it('honours a custom reason override', () => {
    const vm = createSettlementPreviewViewModel({
      fromMemberId: A,
      toMemberId: B,
      amountMinor: 300,
      currencyCode: 'INR',
      members: [],
      reason: 'Manual settlement',
    });

    expect(vm.reason).toBe('Manual settlement');
  });

  it('falls back to the member id when no member name is found', () => {
    const vm = createSettlementPreviewViewModel({
      fromMemberId: 'unknown_from',
      toMemberId: 'unknown_to',
      amountMinor: 100,
      currencyCode: 'USD',
      members: [],
    });

    expect(vm.fromMemberName).toBe('unknown_from');
    expect(vm.toMemberName).toBe('unknown_to');
  });
});

describe('buildDefaultReason', () => {
  it('returns the "no transfer needed" message when the amount is zero', () => {
    const reason = buildDefaultReason('A', 'B', 0, 'USD');
    expect(reason).toContain('No transfer is needed');
  });

  it('returns the "no transfer needed" message when the amount is negative', () => {
    const reason = buildDefaultReason('A', 'B', -10, 'USD');
    expect(reason).toContain('No transfer is needed');
  });

  it('includes both names and a formatted amount', () => {
    const reason = buildDefaultReason('Priya', 'Sam', 300, 'INR');
    expect(reason).toContain('Priya');
    expect(reason).toContain('Sam');
    expect(reason).toContain('₹3.00 INR');
    expect(reason).not.toContain('minor units');
  });
});

// ---------------------------------------------------------------------------
// Empty view models
// ---------------------------------------------------------------------------

describe('createEmptyBalanceExplanation', () => {
  it('produces a settled view model with every amount zero', () => {
    const vm = createEmptyBalanceExplanation('m_a', 'Priya', 'INR');

    expect(vm.memberId).toBe('m_a');
    expect(vm.memberName).toBe('Priya');
    expect(vm.currencyCode).toBe('INR');
    expect(vm.paidMinor).toBe(0);
    expect(vm.shareMinor).toBe(0);
    expect(vm.settlementsSentMinor).toBe(0);
    expect(vm.settlementsReceivedMinor).toBe(0);
    expect(vm.netBalanceMinor).toBe(0);
    expect(vm.summaryKey).toBe('settled');
    expect(vm.hasContributions).toBe(false);
    expect(vm.hasSettlementImpacts).toBe(false);
    expect(vm.hasRoundingNotes).toBe(false);
  });
});

describe('createEmptySettlementPreview', () => {
  it('produces a zero-amount preview with no balances', () => {
    const vm = createEmptySettlementPreview('m_a', 'm_b', 'USD');

    expect(vm.amountMinor).toBe(0);
    expect(vm.currencyCode).toBe('USD');
    expect(vm.hasBalances).toBe(false);
    expect(vm.beforeBalances).toEqual([]);
    expect(vm.afterBalances).toEqual([]);
    expect(vm.reason).toContain('No settlement is needed');
  });
});
