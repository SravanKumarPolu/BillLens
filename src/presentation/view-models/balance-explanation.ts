/**
 * Balance explanation view models (Prompt 19).
 *
 * Pure projection from the explanation-engine output
 * (`BalanceExplanation`, `SettlementExplanation`, `RoundingExplanation`)
 * into shapes the `BalanceExplanationScreen` and
 * `SettlementPreviewScreen` consume.
 *
 * The screens read ONLY from these view models — never from the
 * domain explanation types directly — so the screens stay thin and
 * the layout rules (summary key → label, settlement direction →
 * impact text, before/after balance projection) are unit-testable
 * without rendering React components.
 *
 * No fake financial data — Phase 2 inputs are empty / zero and the
 * resulting view models produce legitimate empty states.
 *
 * Pure functions only — no React, no stores, no I/O.
 */


import type {
  BalanceExplanation,
  ExpenseContribution,
  RoundingExplanation,
  SettlementExplanation,
} from '@domain/explanations/explanation-types';
import type { CurrencyCode } from '@domain/value-objects/currency-code';
import { describeAmount } from '@presentation/design-system/financial-format';
import type { MemberId } from '@shared-types/index';

// ---------------------------------------------------------------------------
// Balance explanation view model
// ---------------------------------------------------------------------------

export interface ContributionViewModel {
  readonly expenseId: string;
  readonly expenseTitle: string;
  readonly paidByMemberId: string | null;
  readonly memberPaidMinor: number;
  readonly memberShareMinor: number;
  /** Signed net = paid − share. Positive = member is owed for this expense. */
  readonly memberNetForExpenseMinor: number;
  readonly expenseDate: string;
}

export interface SettlementImpactViewModel {
  readonly settlementId: string;
  readonly fromMemberId: string;
  readonly toMemberId: string;
  readonly amountMinor: number;
  readonly date: string;
  readonly impactOnMember: 'reduced_debt' | 'reduced_credit' | 'no_impact';
  /** Plain-language label, e.g. "You sent ₹200 — reduced your debt". */
  readonly impactLabel: string;
  /** Direction arrow for the icon, never the only signal. */
  readonly direction: 'sent' | 'received' | 'none';
}

export interface RoundingNoteViewModel {
  readonly expenseId: string;
  readonly totalAmountMinor: number;
  readonly splitSumMinor: number;
  readonly remainderMinor: number;
  readonly distributionMethod: string;
  readonly membersReceivingExtra: readonly string[];
  /** Plain-language note, e.g. "1 minor unit rounded to member a". */
  readonly note: string;
}

export interface BalanceExplanationViewModel {
  readonly memberId: string;
  readonly memberName: string;
  readonly paidMinor: number;
  readonly shareMinor: number;
  readonly settlementsSentMinor: number;
  readonly settlementsReceivedMinor: number;
  readonly netBalanceMinor: number;
  readonly currencyCode: string;
  readonly summaryKey: 'creditor' | 'debtor' | 'settled';
  readonly summaryLabel: string;
  /** Long-form, plain-English explanation built from the engine output. */
  readonly summaryText: string;
  readonly contributions: readonly ContributionViewModel[];
  readonly settlementImpacts: readonly SettlementImpactViewModel[];
  readonly roundingNotes: readonly RoundingNoteViewModel[];
  readonly hasContributions: boolean;
  readonly hasSettlementImpacts: boolean;
  readonly hasRoundingNotes: boolean;
}

// ---------------------------------------------------------------------------
// Settlement preview view model
// ---------------------------------------------------------------------------

export interface MemberBalancePreview {
  readonly memberId: string;
  readonly memberName: string;
  /** Signed balance before the suggested transfer. */
  readonly beforeBalanceMinor: number;
  /** Signed balance after the suggested transfer is applied. */
  readonly afterBalanceMinor: number;
  readonly currencyCode: string;
  /** True when this member is the sender of the suggested transfer. */
  readonly isSender: boolean;
  /** True when this member is the recipient of the suggested transfer. */
  readonly isRecipient: boolean;
}

export interface SettlementPreviewViewModel {
  readonly fromMemberId: string;
  readonly fromMemberName: string;
  readonly toMemberId: string;
  readonly toMemberName: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
  /** Human-readable reason for the suggestion, derived from balances. */
  readonly reason: string;
  readonly beforeBalances: readonly MemberBalancePreview[];
  readonly afterBalances: readonly MemberBalancePreview[];
  readonly hasBalances: boolean;
}

// ---------------------------------------------------------------------------
// Balance explanation builder
// ---------------------------------------------------------------------------

export interface BalanceExplanationInput {
  readonly explanation: BalanceExplanation;
  readonly memberName: string;
  readonly currencyCode: CurrencyCode | string;
  /** Lookup of member display names by id, used to enrich settlement rows. */
  readonly memberNames?: ReadonlyMap<string, string>;
}

/**
 * Build the balance-explanation view model from the explanation-engine
 * output. Pure — no React, no I/O.
 */
export function createBalanceExplanationViewModel(
  input: BalanceExplanationInput,
): BalanceExplanationViewModel {
  const { explanation, memberName } = input;
  const currencyCode = String(input.currencyCode);

  const contributions = explanation.expenseContributions.map((c) =>
    mapContribution(c),
  );
  const settlementImpacts = explanation.settlementImpact.map((s) =>
    mapSettlementImpact(s, input.memberNames),
  );
  const roundingNotes = explanation.roundingNotes.map((r) => mapRoundingNote(r));

  const summaryLabel = summaryLabelFor(explanation.summaryKey);
  const summaryText = buildSummaryText(
    explanation.summaryKey,
    memberName,
    explanation,
    currencyCode,
  );

  return {
    memberId: explanation.memberId,
    memberName,
    paidMinor: explanation.paidMinor,
    shareMinor: explanation.shareMinor,
    settlementsSentMinor: explanation.settlementsSentMinor,
    settlementsReceivedMinor: explanation.settlementsReceivedMinor,
    netBalanceMinor: explanation.netBalanceMinor,
    currencyCode,
    summaryKey: explanation.summaryKey,
    summaryLabel,
    summaryText,
    contributions,
    settlementImpacts,
    roundingNotes,
    hasContributions: contributions.length > 0,
    hasSettlementImpacts: settlementImpacts.length > 0,
    hasRoundingNotes: roundingNotes.length > 0,
  };
}

function mapContribution(c: ExpenseContribution): ContributionViewModel {
  return {
    expenseId: c.expenseId,
    expenseTitle: c.expenseTitle,
    paidByMemberId: c.paidByMemberId !== undefined ? (c.paidByMemberId as string) : null,
    memberPaidMinor: c.memberPaidMinor,
    memberShareMinor: c.memberShareMinor,
    memberNetForExpenseMinor: c.memberNetForExpenseMinor,
    expenseDate: c.expenseDate,
  };
}

function mapSettlementImpact(
  s: SettlementExplanation,
  memberNames?: ReadonlyMap<string, string>,
): SettlementImpactViewModel {
  const fromName = memberNames?.get(s.fromMemberId as string) ?? (s.fromMemberId as string);
  const toName = memberNames?.get(s.toMemberId as string) ?? (s.toMemberId as string);
  let direction: SettlementImpactViewModel['direction'] = 'none';
  let impactLabel: string;
  switch (s.impactOnMember) {
    case 'reduced_debt':
      direction = 'sent';
      impactLabel = `You sent to ${toName} — reduced your debt`;
      break;
    case 'reduced_credit':
      direction = 'received';
      impactLabel = `You received from ${fromName} — reduced what you are owed`;
      break;
    case 'no_impact':
    default:
      impactLabel = 'No impact on your balance';
      break;
  }
  return {
    settlementId: s.settlementId,
    fromMemberId: s.fromMemberId as string,
    toMemberId: s.toMemberId as string,
    amountMinor: s.amountMinor,
    date: s.date,
    impactOnMember: s.impactOnMember,
    impactLabel,
    direction,
  };
}

function mapRoundingNote(r: RoundingExplanation): RoundingNoteViewModel {
  const remainder = r.remainderMinor;
  const memberIds = r.membersReceivingExtra.map((m) => m as string);
  const note =
    remainder === 0
      ? 'No rounding applied'
      : remainder > 0
        ? `${remainder} minor unit${remainder === 1 ? '' : 's'} added to ${memberIds.length} member${memberIds.length === 1 ? '' : 's'} (${r.distributionMethod}).`
        : `${Math.abs(remainder)} minor unit${Math.abs(remainder) === 1 ? '' : 's'} removed from ${memberIds.length} member${memberIds.length === 1 ? '' : 's'} (${r.distributionMethod}).`;
  return {
    expenseId: r.expenseId,
    totalAmountMinor: r.totalAmountMinor,
    splitSumMinor: r.splitSumMinor,
    remainderMinor: remainder,
    distributionMethod: r.distributionMethod,
    membersReceivingExtra: memberIds,
    note,
  };
}

/**
 * Plain-language summary label for the summary key.
 * Always shown next to the amount — colour is never the only signal.
 */
export function summaryLabelFor(key: BalanceExplanation['summaryKey']): string {
  switch (key) {
    case 'creditor':
      return 'You are owed';
    case 'debtor':
      return 'You owe';
    case 'settled':
      return 'Settled';
  }
}

/**
 * Build the long-form, plain-English breakdown used in the formula card.
 *
 *   Paid: ₹1,200
 *   − Your share: ₹300
 *   + Received: ₹200
 *   − Sent: ₹0
 *   = You are owed: ₹900
 *
 * The arithmetic is reconstructed from the engine output (no second
 * source of truth) and uses the same integer-only formatting as
 * `formatAmount` so signs and totals stay consistent.
 */
export function buildSummaryText(
  key: BalanceExplanation['summaryKey'],
  memberName: string,
  explanation: BalanceExplanation,
  currencyCode: string,
): string {
  const paid = explanation.paidMinor;
  const share = explanation.shareMinor;
  const received = explanation.settlementsReceivedMinor;
  const sent = explanation.settlementsSentMinor;
  const net = explanation.netBalanceMinor;

  const sign = (n: number) => (n < 0 ? '-' : '');
  const abs = (n: number) => Math.abs(n);
  const major = (n: number) => {
    const divisor = 100;
    const whole = Math.floor(abs(n) / divisor);
    const cents = abs(n) % divisor;
    return `${sign(n)}${whole}.${cents.toString().padStart(2, '0')}`;
  };

  const lines: string[] = [
    `Paid: ${currencyCode} ${major(paid)}`,
    `− ${memberName}'s share: ${currencyCode} ${major(share)}`,
    `+ Received: ${currencyCode} ${major(received)}`,
    `− Sent: ${currencyCode} ${major(sent)}`,
  ];

  const suffix =
    key === 'creditor'
      ? `${memberName} is owed: ${currencyCode} ${major(net)}`
      : key === 'debtor'
        ? `${memberName} owes: ${currencyCode} ${major(abs(net))}`
        : `${memberName} is settled`;

  lines.push(`= ${suffix}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Settlement preview builder
// ---------------------------------------------------------------------------

export interface MemberBalanceInput {
  readonly memberId: MemberId | string;
  readonly memberName: string;
  /** Signed balance before the suggested transfer. */
  readonly balanceMinor: number;
}

export interface SettlementPreviewInput {
  readonly fromMemberId: MemberId | string;
  readonly toMemberId: MemberId | string;
  readonly amountMinor: number;
  readonly currencyCode: CurrencyCode | string;
  readonly members: readonly MemberBalanceInput[];
  /**
   * Optional reason override. When omitted, a default reason is generated
   * from the from/to balances.
   */
  readonly reason?: string;
}

/**
 * Build the settlement-preview view model by computing the projected
 * "after" balances for every member.
 *
 * The transfer moves `amountMinor` from `fromMemberId` (reducing their
 * debt / increasing their credit) to `toMemberId` (reducing their credit /
 * increasing their debt). The net effect on each side equals the transfer
 * amount.
 *
 * Pure — no React, no I/O.
 */
export function createSettlementPreviewViewModel(
  input: SettlementPreviewInput,
): SettlementPreviewViewModel {
  const fromId = input.fromMemberId as string;
  const toId = input.toMemberId as string;
  const amount = input.amountMinor;
  const currency = String(input.currencyCode);

  const fromName =
    input.members.find((m) => (m.memberId as string) === fromId)?.memberName ?? fromId;
  const toName =
    input.members.find((m) => (m.memberId as string) === toId)?.memberName ?? toId;

  const beforeBalances: MemberBalancePreview[] = input.members.map((m) => {
    const id = m.memberId as string;
    return {
      memberId: id,
      memberName: m.memberName,
      beforeBalanceMinor: m.balanceMinor,
      afterBalanceMinor: m.balanceMinor,
      currencyCode: currency,
      isSender: id === fromId,
      isRecipient: id === toId,
    };
  });

  const afterBalances: MemberBalancePreview[] = beforeBalances.map((b) => {
    let after = b.beforeBalanceMinor;
    if (b.isSender) {
      // Sender's net goes UP by the amount (they paid down their debt).
      after = b.beforeBalanceMinor + amount;
    } else if (b.isRecipient) {
      // Recipient's net goes DOWN by the amount (they got paid back).
      after = b.beforeBalanceMinor - amount;
    }
    return { ...b, afterBalanceMinor: after };
  });

  const reason =
    input.reason ??
    buildDefaultReason(fromName, toName, amount, currency);

  return {
    fromMemberId: fromId,
    fromMemberName: fromName,
    toMemberId: toId,
    toMemberName: toName,
    amountMinor: amount,
    currencyCode: currency,
    reason,
    beforeBalances,
    afterBalances,
    hasBalances: beforeBalances.length > 0,
  };
}

/**
 * Build a plain-English reason for why the suggested transfer exists.
 *
 * The reason is derived from the sender's debt (negative balance) and
 * the recipient's credit (positive balance). When either side is zero,
 * the reason degrades gracefully — no fake financial data is invented.
 */
export function buildDefaultReason(
  fromName: string,
  toName: string,
  amountMinor: number,
  currencyCode: string,
): string {
  if (amountMinor <= 0) {
    return 'No transfer is needed — balances are already settled.';
  }
  return `${fromName} owes ${toName} ${describeAmount(amountMinor, currencyCode, {
    includeDirection: false,
  })}. Settling this transfer brings both balances closer to zero.`;
}

// ---------------------------------------------------------------------------
// Empty view models (Phase 2 helpers)
// ---------------------------------------------------------------------------

/**
 * Build an empty balance-explanation view model for a member with no
 * financial activity. Every amount is zero, every list is empty, the
 * summary is "Settled".
 */
export function createEmptyBalanceExplanation(
  memberId: string,
  memberName: string,
  currencyCode: string,
): BalanceExplanationViewModel {
  const emptyExplanation: BalanceExplanation = {
    memberId: memberId as MemberId,
    paidMinor: 0,
    shareMinor: 0,
    settlementsSentMinor: 0,
    settlementsReceivedMinor: 0,
    netBalanceMinor: 0,
    expenseContributions: [],
    settlementImpact: [],
    roundingNotes: [],
    summaryKey: 'settled',
    summaryText: `${memberName} is settled.`,
  };
  return createBalanceExplanationViewModel({
    explanation: emptyExplanation,
    memberName,
    currencyCode,
  });
}

/**
 * Build an empty settlement-preview view model. Used by Phase 2 routes
 * when no suggested transfer exists yet — every balance is zero and
 * `hasBalances` is false.
 */
export function createEmptySettlementPreview(
  fromMemberId: string,
  toMemberId: string,
  currencyCode: string,
): SettlementPreviewViewModel {
  return createSettlementPreviewViewModel({
    fromMemberId,
    toMemberId,
    amountMinor: 0,
    currencyCode,
    members: [],
    reason: 'No settlement is needed right now — everyone is settled up.',
  });
}
