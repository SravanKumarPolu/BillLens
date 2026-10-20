
import type { BalanceQueryPort } from '@application/balances/balance-query.port';
import { memberIdsOf } from '@application/balances/balance-query.port';
import {
  calculateGroupBalancesByCurrency,
} from '@domain/services/balances/balance-engine';
import type { CurrencyCode } from '@domain/value-objects';
import type { GroupId } from '@shared-types/index';

/**
 * Use case: Generate a group settlement summary message.
 *
 * Phase 6 Track 6 / Prompt 59 — builds a neutral, privacy-respecting
 * summary of the group's open balances for the
 * `group_summary` reminder type. The summary includes:
 *
 *   - The group name.
 *   - The number of members with non-zero balances.
 *   - The total amount still open (per currency).
 *   - A neutral message: "{groupName}: {N} members still have open
 *     balances totaling {amount}. Open BillLens to review."
 *
 * ── Privacy ──
 *
 * The summary does NOT name specific members or their individual
 * balances. It only includes the count and the total — enough to
 * prompt the user to open the app without exposing anyone's
 * financial situation on the lock screen.
 *
 * ── Wording ──
 *
 * Neutral per the spec. No shame language.
 */
export class GenerateGroupSettlementSummaryUseCase {
  constructor(
    private readonly balanceQuery: BalanceQueryPort,
  ) {}

  async execute(input: GenerateGroupSettlementSummaryInput): Promise<GenerateGroupSettlementSummaryOutput> {
    const data = await this.balanceQuery.loadGroupBalanceInput(input.groupId);
    if (data === null) {
      return { notFound: true, summaries: [] };
    }
    const results = calculateGroupBalancesByCurrency({
      groupId: input.groupId as string,
      members: memberIdsOf(data),
      expenses: data.expenses,
      payers: data.payers,
      splits: data.splits,
      settlements: data.settlements,
    });

    const summaries: CurrencySummary[] = [];
    for (const r of results) {
      const unsettled = r.memberCurrencyBalances.filter((b) => b.netBalanceMinor !== 0);
      if (unsettled.length === 0) continue;
      const totalOpenMinor = unsettled.reduce(
        (acc, b) => acc + Math.abs(b.netBalanceMinor),
        0,
      ) / 2; // divide by 2 because each balance is counted from both sides
      summaries.push({
        currencyCode: r.currencyCode,
        unsettledMemberCount: unsettled.length,
        totalOpenMinor,
        message: buildSummaryMessage(input.groupName, unsettled.length, formatAmount(totalOpenMinor, r.currencyCode)),
      });
    }

    return { notFound: false, summaries };
  }
}

export interface GenerateGroupSettlementSummaryInput {
  readonly groupId: GroupId;
  readonly groupName: string;
}

export interface CurrencySummary {
  readonly currencyCode: CurrencyCode;
  readonly unsettledMemberCount: number;
  readonly totalOpenMinor: number;
  readonly message: string;
}

export interface GenerateGroupSettlementSummaryOutput {
  readonly notFound: boolean;
  readonly summaries: readonly CurrencySummary[];
}

function buildSummaryMessage(groupName: string, memberCount: number, totalOpen: string): string {
  return (
    `${groupName}: ${memberCount} ${memberCount === 1 ? 'member has' : 'members have'} ` +
    `open balances totaling ${totalOpen}. ` +
    `Open BillLens to review the details.`
  );
}

function formatAmount(minor: number, currencyCode: string): string {
  // Simple 2-decimal formatting. The balance engine has a more
  // sophisticated formatter, but for the summary message we keep
  // it simple.
  const major = minor / 100;
  const symbol = currencySymbol(currencyCode);
  return `${symbol}${major.toFixed(2)}`;
}

const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  INR: '₹',
  USD: '$',
  GBP: '£',
  EUR: '€',
  JPY: '¥',
};

function currencySymbol(currencyCode: string): string {
  return CURRENCY_SYMBOLS[currencyCode.toUpperCase()] ?? `${currencyCode} `;
}
