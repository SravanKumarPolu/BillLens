import { getCurrency } from '../../entities/currency';
import type { CurrencyCode } from '../../value-objects/currency-code';
import type { MemberBalance, SuggestedTransfer } from '../balances/balance-engine';
import { generateSuggestedTransfers } from '../balances/balance-engine';

/**
 * Settlement simplification service.
 *
 * Given a set of member balances, this module produces a minimal-ish set
 * of suggested transfers that would zero out all balances if executed.
 *
 * BillLens uses a greedy algorithm (see `generateSuggestedTransfers` in
 * `balance-engine.ts`) rather than a globally optimal one. The greedy
 * algorithm is deterministic, runs in O(n log n) time, and produces
 * results that preserve all net balances exactly.
 *
 * Minimizing the number of transfers is NP-hard in general. For groups
 * of friends / roommates / travel groups (typically 2–20 members), the
 * greedy result is usually within 1 transfer of optimal, and is
 * deterministic — a key property for reproducibility across devices.
 */

export interface SettlementSimplificationInput {
  readonly memberBalances: readonly MemberBalance[];
}

export interface SettlementSimplificationResult {
  readonly transfers: readonly SuggestedTransfer[];
  /** Total amount that would change hands if all transfers execute. */
  readonly totalFlowMinor: number;
  /** Number of transfers suggested. */
  readonly transferCount: number;
}

/**
 * Compute suggested transfers that settle all member balances.
 *
 * @example
 *   const result = simplifySettlements({ memberBalances });
 *   // result.transfers: [{ from: 'b', to: 'a', amount: 400 }, { from: 'c', to: 'a', amount: 500 }]
 */
export function simplifySettlements(
  input: SettlementSimplificationInput,
): SettlementSimplificationResult {
  const transfers = generateSuggestedTransfers(input.memberBalances);
  const totalFlowMinor = transfers.reduce((acc, t) => acc + t.amountMinor, 0);
  return {
    transfers,
    totalFlowMinor,
    transferCount: transfers.length,
  };
}

/**
 * Verify that executing all suggested transfers would zero out all balances.
 *
 * This is a safety check used by tests and the explanation engine. It
 * should always return `true` for output produced by `simplifySettlements`.
 */
export function verifyTransfersZeroOutBalances(
  balances: readonly MemberBalance[],
  transfers: readonly SuggestedTransfer[],
): boolean {
  const afterTransfer = new Map<string, number>();
  for (const b of balances) {
    afterTransfer.set(b.memberId as string, b.netBalanceMinor);
  }
  for (const t of transfers) {
    const fromKey = t.fromMemberId as string;
    const toKey = t.toMemberId as string;
    afterTransfer.set(fromKey, (afterTransfer.get(fromKey) ?? 0) + t.amountMinor);
    afterTransfer.set(toKey, (afterTransfer.get(toKey) ?? 0) - t.amountMinor);
  }
  for (const value of afterTransfer.values()) {
    if (value !== 0) return false;
  }
  return true;
}

/**
 * Generate a human-readable explanation for a single suggested transfer.
 *
 * Uses integer-based formatting (NOT floating-point division) to avoid
 * IEEE 754 precision loss when converting minor units to a major-unit
 * display string. Honors the currency's `decimalPlaces` setting (e.g.
 * JPY has 0 decimals, INR has 2); unknown currencies default to 2.
 *
 * @example
 *   "B owes A ₹4.00. After this transfer, B will be settled."
 */
export function explainTransfer(
  transfer: SuggestedTransfer,
  fromName: string,
  toName: string,
  currencySymbol: string,
  currencyCode?: CurrencyCode | string,
): string {
  const decimals = currencyCode
    ? (getCurrency(currencyCode as CurrencyCode)?.decimalPlaces ?? 2)
    : 2;
  const divisor = Math.pow(10, decimals);
  const majorPart = Math.floor(Math.abs(transfer.amountMinor) / divisor);
  const minorPart = Math.abs(transfer.amountMinor) % divisor;
  const sign = transfer.amountMinor < 0 ? '-' : '';
  const amountMajor = `${sign}${majorPart}.${minorPart.toString().padStart(decimals, '0')}`;
  return (
    `${fromName} owes ${toName} ${currencySymbol}${amountMajor}. ` +
    `After this transfer, ${fromName} will be settled.`
  );
}

/**
 * A suggested transfer paired with a positional hint about its place in
 * the suggested execution order.
 */
export interface TransferWithHint {
  readonly transfer: SuggestedTransfer;
  /**
   * Positional hint: how many transfers follow this one in the returned
   * array (`transfers.length - index - 1`). NOT a recomputed remaining-
   * transfer count — see `suggestTransferOrder` for details.
   */
  readonly remainingTransfersHint: number;
}

/**
 * Returns transfers in order with a positional hint.
 * NOTE: The `remainingTransfersHint` is a positional count
 * (transfers.length - index - 1), NOT a recomputed remaining-transfer
 * count. A proper implementation would re-run simplifySettlements after
 * applying each transfer. This is a Phase 2 enhancement.
 */
export function suggestTransferOrder(
  transfers: readonly SuggestedTransfer[],
): TransferWithHint[] {
  // Phase 1: return transfers in their original order with a positional
  // hint (transfers.length - i - 1). This is NOT a recomputed count —
  // a proper implementation would re-run simplifySettlements after each
  // transfer and report the actual remaining count. Phase 2 enhancement.
  return transfers.map((transfer, i) => ({
    transfer,
    remainingTransfersHint: transfers.length - i - 1,
  }));
}

/**
 * Filter members who are settled (net = 0) — useful for UI display.
 */
export function filterUnsettledMembers(
  balances: readonly MemberBalance[],
): MemberBalance[] {
  return balances.filter((b) => b.netBalanceMinor !== 0);
}

/**
 * Filter members who owe money (debtors).
 */
export function filterDebtors(balances: readonly MemberBalance[]): MemberBalance[] {
  return balances.filter((b) => b.netBalanceMinor < 0);
}

/**
 * Filter members who should receive money (creditors).
 */
export function filterCreditors(balances: readonly MemberBalance[]): MemberBalance[] {
  return balances.filter((b) => b.netBalanceMinor > 0);
}
