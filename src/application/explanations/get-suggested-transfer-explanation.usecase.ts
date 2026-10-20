
import type { BalanceQueryPort } from '@application/balances/balance-query.port';
import { memberIdsOf } from '@application/balances/balance-query.port';
import { formatMinorAmount } from '@domain/entities/currency';
import { calculateGroupBalancesByCurrency } from '@domain/services/balances/balance-engine';
import type { BalanceExplanationEntry } from '@domain/services/balances/balance-engine';
import type { CurrencyCode } from '@domain/value-objects/currency-code';
import type { GroupId, MemberId } from '@shared-types/index';

/**
 * Use case: Get a structured explanation for a single suggested transfer.
 *
 * Phase 6 Prompt 55 — required use case `GetSuggestedTransferExplanationUseCase`.
 *
 * For a given (group, from, to, amount, currency), produces a
 * structured explanation:
 *
 *   - The payer's current balance
 *   - The receiver's current balance
 *   - The suggested amount
 *   - Whether it is a full or partial settlement
 *   - The expected balances after the transfer
 *   - Whether the transfer is direct debt or simplified debt
 *   - A human-readable explanation string
 *
 * The spec's example for a direct debt:
 *
 *   "You owe £42.
 *    Maya should receive £42.
 *    Paying Maya £42 settles both balances."
 *
 * The spec's example for a simplified debt:
 *
 *   "You did not necessarily share an expense directly with Maya.
 *    This transfer is suggested because BillLens simplified the
 *    group's debts while preserving everyone's final balance."
 */
export class GetSuggestedTransferExplanationUseCase {
  constructor(private readonly balanceQuery: BalanceQueryPort) {}

  async execute(input: GetSuggestedTransferExplanationInput): Promise<GetSuggestedTransferExplanationOutput> {
    const data = await this.balanceQuery.loadGroupBalanceInput(input.groupId);
    if (data === null) {
      return { notFound: true, explanation: null };
    }
    const results = calculateGroupBalancesByCurrency({
      groupId: input.groupId as string,
      members: memberIdsOf(data),
      expenses: data.expenses,
      payers: data.payers,
      splits: data.splits,
      settlements: data.settlements,
    });

    const currencyResult = results.find((r) => r.currencyCode === input.currencyCode);
    if (currencyResult === undefined) {
      return { notFound: false, explanation: null };
    }

    const fromBalance = currencyResult.memberCurrencyBalances.find(
      (b) => b.memberId === input.fromMemberId,
    );
    const toBalance = currencyResult.memberCurrencyBalances.find(
      (b) => b.memberId === input.toMemberId,
    );
    if (fromBalance === undefined || toBalance === undefined) {
      return { notFound: false, explanation: null };
    }

    const fromBefore = fromBalance.netBalanceMinor;
    const toBefore = toBalance.netBalanceMinor;
    const fromAfter = fromBefore + input.amountMinor;
    const toAfter = toBefore - input.amountMinor;
    const isFull = fromAfter === 0 && toAfter === 0;

    // Classify as direct vs simplified
    const fromEntries = currencyResult.explanations.get(input.fromMemberId as string) ?? [];
    const toEntries = currencyResult.explanations.get(input.toMemberId as string) ?? [];
    const hasDirectExpense =
      fromEntries.some((e: BalanceExplanationEntry) => e.paidByMemberId === input.toMemberId) ||
      toEntries.some((e: BalanceExplanationEntry) => e.paidByMemberId === input.fromMemberId);
    const reasonCode = hasDirectExpense ? 'direct_debt' : 'simplified_debt';

    // Build the explanation message
    const message =
      reasonCode === 'direct_debt'
        ? `You owe ${formatMinor(Math.abs(fromBefore), input.currencyCode)}.\n` +
          `${input.toMemberName ?? 'The receiver'} should receive ${formatMinor(Math.abs(fromBefore), input.currencyCode)}.\n` +
          `Paying ${formatMinor(input.amountMinor, input.currencyCode)}${isFull ? ' settles both balances.' : ' is a partial payment.'}`
        : `You did not necessarily share an expense directly with ${input.toMemberName ?? 'this member'}.\n` +
          `This transfer is suggested because BillLens simplified the group's debts while preserving everyone's final balance.`;

    return {
      notFound: false,
      explanation: {
        currencyCode: input.currencyCode,
        fromMemberId: input.fromMemberId,
        toMemberId: input.toMemberId,
        amountMinor: input.amountMinor,
        fromBefore,
        toBefore,
        fromAfter,
        toAfter,
        isFull,
        reasonCode,
        message,
      },
    };
  }
}

export interface GetSuggestedTransferExplanationInput {
  readonly groupId: GroupId;
  readonly fromMemberId: MemberId;
  readonly toMemberId: MemberId;
  readonly currencyCode: string;
  readonly amountMinor: number;
  readonly fromMemberName?: string;
  readonly toMemberName?: string;
}

export interface TransferExplanation {
  readonly currencyCode: string;
  readonly fromMemberId: MemberId;
  readonly toMemberId: MemberId;
  readonly amountMinor: number;
  readonly fromBefore: number;
  readonly toBefore: number;
  readonly fromAfter: number;
  readonly toAfter: number;
  readonly isFull: boolean;
  readonly reasonCode: 'direct_debt' | 'simplified_debt';
  readonly message: string;
}

export interface GetSuggestedTransferExplanationOutput {
  readonly notFound: boolean;
  readonly explanation: TransferExplanation | null;
}

function formatMinor(minor: number, currencyCode: string): string {
  // v2.5.0: currency-aware minor-unit formatting (was hardcoded ÷100 —
  // wrong for JPY/KWD-scale currencies).
  return formatMinorAmount(minor, currencyCode as CurrencyCode);
}
