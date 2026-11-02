
import type { BalanceQueryPort } from '@application/balances/balance-query.port';
import { memberIdsOf } from '@application/balances/balance-query.port';
import { calculateGroupBalancesByCurrency } from '@domain/services/balances/balance-engine';
import type { GroupId, MemberId } from '@shared-types/index';

/**
 * Use case: Preview the balance impact of a proposed settlement.
 *
 * Phase 6 Prompt 55 — required use case `PreviewSettlementImpactUseCase`.
 *
 * Computes the before/after balances for the payer and receiver if
 * a settlement of `amountMinor` in `currencyCode` were to complete.
 * Does NOT mutate any settlement — it's a pure preview.
 *
 * The spec example:
 *
 *   Before:
 *   You owe: £42
 *   Maya receives: £42
 *
 *   After paying £25:
 *   You owe: £17
 *   Maya receives: £17
 *
 * ── Multi-currency ──
 *
 * The preview only affects the specified currency. Other currencies
 * are unchanged. The spec rule: "Never combine £30 owed and ₹2,000
 * receivable into a single net amount."
 */
export class PreviewSettlementImpactUseCase {
  constructor(private readonly balanceQuery: BalanceQueryPort) {}

  async execute(input: PreviewSettlementImpactInput): Promise<PreviewSettlementImpactOutput> {
    const data = await this.balanceQuery.loadGroupBalanceInput(input.groupId);
    if (data === null) {
      return { notFound: true, previews: [] };
    }
    const results = calculateGroupBalancesByCurrency({
      groupId: input.groupId as string,
      members: memberIdsOf(data),
      expenses: data.expenses,
      payers: data.payers,
      splits: data.splits,
      settlements: data.settlements,
    });

    // Find the currency result for the specified currency
    const currencyResult = results.find((r) => r.currencyCode === input.currencyCode);
    if (currencyResult === undefined) {
      return { notFound: false, previews: [] };
    }

    const payerBalance = currencyResult.memberCurrencyBalances.find(
      (b) => b.memberId === input.payerMemberId,
    );
    const receiverBalance = currencyResult.memberCurrencyBalances.find(
      (b) => b.memberId === input.receiverMemberId,
    );

    if (payerBalance === undefined || receiverBalance === undefined) {
      return { notFound: false, previews: [] };
    }

    const payerBefore = payerBalance.netBalanceMinor;
    const receiverBefore = receiverBalance.netBalanceMinor;

    // A settlement from payer to receiver:
    //   payer's net increases by amountMinor (they paid → they owe less)
    //   receiver's net decreases by amountMinor (they received → they're owed less)
    const payerAfter = payerBefore + input.amountMinor;
    const receiverAfter = receiverBefore - input.amountMinor;

    const isFullSettlement = payerAfter === 0 && receiverAfter === 0;
    const isPartial = !isFullSettlement && input.amountMinor < Math.abs(payerBefore);
    const isOverpayment = input.amountMinor > Math.abs(payerBefore);

    return {
      notFound: false,
      previews: [{
        currencyCode: input.currencyCode,
        payerMemberId: input.payerMemberId,
        receiverMemberId: input.receiverMemberId,
        amountMinor: input.amountMinor,
        payerBefore,
        receiverBefore,
        payerAfter,
        receiverAfter,
        isFullSettlement,
        isPartial,
        isOverpayment,
      }],
    };
  }
}

export interface PreviewSettlementImpactInput {
  readonly groupId: GroupId;
  readonly payerMemberId: MemberId;
  readonly receiverMemberId: MemberId;
  readonly currencyCode: string;
  readonly amountMinor: number;
}

export interface SettlementImpactPreview {
  readonly currencyCode: string;
  readonly payerMemberId: MemberId;
  readonly receiverMemberId: MemberId;
  readonly amountMinor: number;
  readonly payerBefore: number;
  readonly receiverBefore: number;
  readonly payerAfter: number;
  readonly receiverAfter: number;
  readonly isFullSettlement: boolean;
  readonly isPartial: boolean;
  readonly isOverpayment: boolean;
}

export interface PreviewSettlementImpactOutput {
  readonly notFound: boolean;
  readonly previews: readonly SettlementImpactPreview[];
}
