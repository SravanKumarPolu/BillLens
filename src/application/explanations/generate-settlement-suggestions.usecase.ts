
import type { BalanceQueryPort } from '@application/balances/balance-query.port';
import { memberIdsOf } from '@application/balances/balance-query.port';
import type { CurrencyBalanceResult, SuggestedTransfer, BalanceExplanationEntry } from '@domain/services/balances/balance-engine';
import { calculateGroupBalancesByCurrency } from '@domain/services/balances/balance-engine';
import type { GroupId } from '@shared-types/index';

/**
 * Use case: Generate settlement suggestions for a group.
 *
 * Phase 6 Prompt 55 — required use case `GenerateSettlementSuggestionsUseCase`.
 *
 * Loads the group's balances via the multi-currency balance engine,
 * extracts the suggested transfers per currency, and returns them
 * with structured reasoning (direct debt vs simplified debt).
 *
 * The suggested transfers come from the balance engine's greedy
 * simplification algorithm (Track 3 / Phase 1). Each transfer
 * includes the from/to/amount/currency. The explanation use case
 * adds a `reasonCode` field: `'direct_debt'` when the payer and
 * receiver have a direct expense relationship, `'simplified_debt'`
 * when the transfer is a result of the simplification algorithm.
 *
 * ── Multi-currency ──
 *
 * Suggestions are per-currency — never cross-currency. The spec
 * rule: "Never suggest 'Pay £10 to offset ₹1,000'."
 */
export class GenerateSettlementSuggestionsUseCase {
  constructor(private readonly balanceQuery: BalanceQueryPort) {}

  async execute(input: GenerateSettlementSuggestionsInput): Promise<GenerateSettlementSuggestionsOutput> {
    const data = await this.balanceQuery.loadGroupBalanceInput(input.groupId);
    if (data === null) {
      return { notFound: true, suggestions: [] };
    }
    const results = calculateGroupBalancesByCurrency({
      groupId: input.groupId as string,
      members: memberIdsOf(data),
      expenses: data.expenses,
      payers: data.payers,
      splits: data.splits,
      settlements: data.settlements,
    });

    const suggestions: CurrencySuggestions[] = results.map((r) => ({
      currencyCode: r.currencyCode,
      transfers: r.suggestedTransfers.map((t) => ({
        ...t,
        currencyCode: r.currencyCode,
        reasonCode: classifyTransfer(t, r),
      })),
      transferCount: r.suggestedTransfers.length,
      totalTransferredMinor: r.suggestedTransfers.reduce((acc, t) => acc + t.amountMinor, 0),
    }));

    return { notFound: false, suggestions };
  }
}

export interface GenerateSettlementSuggestionsInput {
  readonly groupId: GroupId;
}

export interface SuggestedTransferWithReason extends SuggestedTransfer {
  readonly currencyCode: string;
  readonly reasonCode: 'direct_debt' | 'simplified_debt';
}

export interface CurrencySuggestions {
  readonly currencyCode: string;
  readonly transfers: readonly SuggestedTransferWithReason[];
  readonly transferCount: number;
  readonly totalTransferredMinor: number;
}

export interface GenerateSettlementSuggestionsOutput {
  readonly notFound: boolean;
  readonly suggestions: readonly CurrencySuggestions[];
}

/**
 * Classify a suggested transfer as 'direct_debt' or 'simplified_debt'.
 *
 * A transfer is 'direct_debt' if the payer and receiver share at
 * least one expense in this currency (one paid, the other has a
 * share). Otherwise it's 'simplified_debt' — the greedy algorithm
 * paired them even though they have no direct expense relationship.
 *
 * We use the balance engine's `explanations` map: if the payer has
 * an entry where `paidByMemberId` is the receiver (or vice versa),
 * they share a direct expense.
 */
function classifyTransfer(
  transfer: SuggestedTransfer,
  result: CurrencyBalanceResult,
): 'direct_debt' | 'simplified_debt' {
  const fromEntries = result.explanations.get(transfer.fromMemberId as string) ?? [];
  const toEntries = result.explanations.get(transfer.toMemberId as string) ?? [];

  // Check if the receiver paid for an expense that the payer shares
  const receiverPaidForPayer = fromEntries.some(
    (e: BalanceExplanationEntry) => e.paidByMemberId === transfer.toMemberId,
  );
  // Check if the payer paid for an expense that the receiver shares
  const payerPaidForReceiver = toEntries.some(
    (e: BalanceExplanationEntry) => e.paidByMemberId === transfer.fromMemberId,
  );

  return receiverPaidForPayer || payerPaidForReceiver ? 'direct_debt' : 'simplified_debt';
}
