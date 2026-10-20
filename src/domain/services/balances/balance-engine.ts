import type { MemberId } from '@shared-types/index';

import { getCurrency } from '../../entities/currency';
import type { Expense } from '../../entities/expense';
import type { ExpensePayer } from '../../entities/expense-payer';
import type { ExpenseSplit } from '../../entities/expense-split';
import type { Settlement } from '../../entities/settlement';
import { BalanceValidationError } from '../../errors/index';
import type { CurrencyCode } from '../../value-objects/currency-code';
import type { DateTime } from '../../value-objects/date-time';
import { nowDateTime } from '../../value-objects/date-time';
import { Money } from '../../value-objects/money';

/**
 * Per-member balance breakdown.
 *
 * Sign convention:
 *   - `netBalanceMinor > 0` → member should RECEIVE money (creditor).
 *   - `netBalanceMinor < 0` → member should PAY money (debtor).
 *   - `netBalanceMinor = 0` → member is settled.
 *
 * Formula:
 *   net = paid − share − settlementsReceived + settlementsSent
 *
 * Where:
 *   - `paid` is the total amount the member paid across all expenses.
 *   - `share` is the sum of the member's split amounts across all expenses.
 *   - `settlementsReceived` is the sum of settlements where this member was
 *     the payee (`toMemberId`).
 *   - `settlementsSent` is the sum of settlements where this member was
 *     the payer (`fromMemberId`).
 *
 * A settlement received REDUCES what a creditor is still owed (they've been
 * paid back, so they're owed less). A settlement sent REDUCES what a debtor
 * still owes (they've paid, so they owe less).
 */
export interface MemberBalance {
  readonly memberId: MemberId;
  readonly paidMinor: number;
  readonly shareMinor: number;
  readonly settlementsSentMinor: number;
  readonly settlementsReceivedMinor: number;
  readonly netBalanceMinor: number;
}

export interface SuggestedTransfer {
  readonly fromMemberId: MemberId;
  readonly toMemberId: MemberId;
  readonly amountMinor: number;
}

export interface BalanceExplanationEntry {
  readonly expenseId: string;
  readonly expenseTitle: string;
  /** Member who paid for this expense. Omitted when no payer records exist. */
  readonly paidByMemberId?: MemberId;
  readonly memberPaidMinor: number;
  readonly memberShareMinor: number;
  readonly memberNetForExpenseMinor: number;
}

/**
 * Diagnostic emitted when a per-expense invariant is violated during
 * balance calculation. The balance engine does NOT throw on these — it
 * still produces a result, but flags the corruption via `validationStatus`
 * and lists the offending expenses here for the UI / audit log.
 */
export interface BalanceDiagnostic {
  readonly expenseId: string;
  readonly issue: 'payer_total_mismatch' | 'split_total_mismatch';
  readonly expected: number;
  readonly actual: number;
}

/**
 * Group-level validation status produced by the balance engine.
 *
 *   - `'balanced'` — Σ memberBalances.netBalanceMinor === 0 and no unknown
 *     members were skipped during calculation.
 *   - `'incomplete_membership'` — Σ ≠ 0 because some payers/splits
 *     referenced members not in the active `members` list (their share is
 *     "lost" to the engine).
 *   - `'data_corruption'` — Σ ≠ 0 even though all referenced members were
 *     known — the input data is genuinely inconsistent (e.g. split totals
 *     don't sum to the expense total).
 */
export type BalanceValidationStatus =
  | 'balanced'
  | 'incomplete_membership'
  | 'data_corruption';

export interface BalanceResult {
  readonly groupId: string;
  readonly currency: CurrencyCode;
  readonly memberBalances: readonly MemberBalance[];
  readonly suggestedTransfers: readonly SuggestedTransfer[];
  /** Per-member list of expense contributions for explanation UI. */
  readonly explanations: ReadonlyMap<string, readonly BalanceExplanationEntry[]>;
  /**
   * True if `Σ memberBalances.netBalanceMinor === 0`. If false, the input
   * data is inconsistent (e.g. split amounts don't sum to expense totals,
   * or members were skipped).
   */
  readonly isBalanced: boolean;
  /** Group-level validation status (richer than `isBalanced`). */
  readonly validationStatus: BalanceValidationStatus;
  /**
   * Per-expense invariant violations detected during calculation. Empty
   * when no per-expense invariants were violated. The balance engine does
   * NOT throw on these — see `BalanceDiagnostic` for details.
   */
  readonly diagnostics: readonly BalanceDiagnostic[];
}

export interface BalanceEngineInput {
  readonly groupId: string;
  readonly currency: CurrencyCode;
  readonly members: readonly MemberId[];
  /** Active (non-deleted) expenses. */
  readonly expenses: readonly Expense[];
  /** All payers for the expenses (active ones only). */
  readonly payers: readonly ExpensePayer[];
  /** All splits for the expenses (active ones only). */
  readonly splits: readonly ExpenseSplit[];
  /** Active (non-deleted) settlements. */
  readonly settlements: readonly Settlement[];
}

/**
 * Pure balance engine.
 *
 * Computes per-member net balances and suggested transfers for a group.
 * Has NO dependency on React Native, Supabase, SQLite, or any storage —
 * it operates entirely on in-memory domain data.
 *
 * Algorithm:
 *   1. Initialize each member's `paid`, `share`, `settlementsSent`,
 *      `settlementsReceived` to 0.
 *   2. For each active expense:
 *      - For each payer record, add `amountMinor` to that member's `paid`.
 *      - For each split record, add `amountMinor` to that member's `share`.
 *      - Verify per-expense invariants: Σ payers.amountMinor === expense.amountMinor
 *        and Σ splits.amountMinor === expense.amountMinor. Record a
 *        `BalanceDiagnostic` for each violation.
 *   3. For each active settlement:
 *      - Add `amountMinor` to `fromMemberId`'s `settlementsSent`.
 *      - Add `amountMinor` to `toMemberId`'s `settlementsReceived`.
 *   4. Compute `netBalance = paid - share - settlementsReceived + settlementsSent`.
 *   5. Generate suggested transfers via the greedy settlement algorithm.
 *   6. Build per-member explanation entries from per-expense contributions.
 *   7. Compute `validationStatus` from `totalNet` and whether any unknown
 *      members were skipped during step 2.
 *
 * @example
 *   const result = calculateGroupBalances({
 *     groupId: 'g1',
 *     currency: 'INR',
 *     members: [asMemberId('a'), asMemberId('b'), asMemberId('c')],
 *     expenses: [...],
 *     payers: [...],
 *     splits: [...],
 *     settlements: [],
 *   });
 */
export function calculateGroupBalances(input: BalanceEngineInput): BalanceResult {
  validateBalanceInput(input);

  // Step 1: Initialize per-member accumulators.
  const paidMap = new Map<string, number>();
  const shareMap = new Map<string, number>();
  const sentMap = new Map<string, number>();
  const receivedMap = new Map<string, number>();
  // Per-member per-expense explanation entries.
  const perMemberExpenses = new Map<string, BalanceExplanationEntry[]>();

  for (const member of input.members) {
    const key = member as string;
    paidMap.set(key, 0);
    shareMap.set(key, 0);
    sentMap.set(key, 0);
    receivedMap.set(key, 0);
    perMemberExpenses.set(key, []);
  }

  // Index expenses by ID for explanation lookups.
  const expenseById = new Map<string, Expense>();
  for (const expense of input.expenses) {
    expenseById.set(expense.id as string, expense);
  }

  // Step 2: Process expenses.
  // Group payers and splits by expenseId for efficient lookup.
  const payersByExpense = new Map<string, ExpensePayer[]>();
  const splitsByExpense = new Map<string, ExpenseSplit[]>();
  for (const payer of input.payers) {
    const key = payer.expenseId as string;
    const list = payersByExpense.get(key) ?? [];
    list.push(payer);
    payersByExpense.set(key, list);
  }
  for (const split of input.splits) {
    const key = split.expenseId as string;
    const list = splitsByExpense.get(key) ?? [];
    list.push(split);
    splitsByExpense.set(key, list);
  }

  const diagnostics: BalanceDiagnostic[] = [];
  let skippedUnknownMember = false;

  for (const expense of input.expenses) {
    if (expense.deletedAt) continue;
    if (expense.currencyCode !== input.currency) {
      // For Phase 1 (single-currency groups), this is an error.
      throw new BalanceValidationError(
        `Expense ${expense.id} currency ${expense.currencyCode} does not match group currency ${input.currency}`,
      );
    }

    const expensePayers = payersByExpense.get(expense.id as string) ?? [];
    const expenseSplits = splitsByExpense.get(expense.id as string) ?? [];

    // Track per-member contribution for this expense.
    const paidForExpense = new Map<string, number>();
    const shareForExpense = new Map<string, number>();

    // Per-expense invariant: Σ payers.amountMinor === expense.amountMinor.
    // We check this against ALL payer records (including those referencing
    // unknown members) so that the diagnostic is meaningful.
    let payerTotalForExpense = 0;
    for (const payer of expensePayers) {
      // Soft-deleted payers are excluded from balance calculations but
      // retained for historical integrity (audit trail, explanations).
      if (payer.deletedAt) continue;
      payerTotalForExpense += payer.amountMinor;
      const key = payer.memberId as string;
      if (!paidMap.has(key)) {
        skippedUnknownMember = true;
        continue; // skip unknown members (historical integrity)
      }
      paidMap.set(key, (paidMap.get(key) ?? 0) + payer.amountMinor);
      paidForExpense.set(key, (paidForExpense.get(key) ?? 0) + payer.amountMinor);
    }
    if (payerTotalForExpense !== expense.amountMinor) {
      diagnostics.push({
        expenseId: expense.id as string,
        issue: 'payer_total_mismatch',
        expected: expense.amountMinor,
        actual: payerTotalForExpense,
      });
    }

    // Per-expense invariant: Σ splits.amountMinor === expense.amountMinor.
    let splitTotalForExpense = 0;
    for (const split of expenseSplits) {
      // Soft-deleted splits are excluded from balance calculations but
      // retained for historical integrity (audit trail, explanations).
      if (split.deletedAt) continue;
      splitTotalForExpense += split.amountMinor;
      const key = split.memberId as string;
      if (!shareMap.has(key)) {
        skippedUnknownMember = true;
        continue;
      }
      shareMap.set(key, (shareMap.get(key) ?? 0) + split.amountMinor);
      shareForExpense.set(key, (shareForExpense.get(key) ?? 0) + split.amountMinor);
    }
    if (splitTotalForExpense !== expense.amountMinor) {
      diagnostics.push({
        expenseId: expense.id as string,
        issue: 'split_total_mismatch',
        expected: expense.amountMinor,
        actual: splitTotalForExpense,
      });
    }

    // Build per-member explanation entries for this expense.
    const allMemberKeys = new Set<string>([
      ...paidForExpense.keys(),
      ...shareForExpense.keys(),
    ]);
    for (const memberKey of allMemberKeys) {
      if (!perMemberExpenses.has(memberKey)) continue;
      const memberPaid = paidForExpense.get(memberKey) ?? 0;
      const memberShare = shareForExpense.get(memberKey) ?? 0;
      const entry: BalanceExplanationEntry = {
        expenseId: expense.id as string,
        expenseTitle: expense.title,
        ...(expensePayers[0]
          ? { paidByMemberId: expensePayers[0].memberId }
          : {}),
        memberPaidMinor: memberPaid,
        memberShareMinor: memberShare,
        memberNetForExpenseMinor: memberPaid - memberShare,
      };
      const list = perMemberExpenses.get(memberKey) ?? [];
      list.push(entry);
      perMemberExpenses.set(memberKey, list);
    }
  }

  // Step 3: Process settlements.
  for (const settlement of input.settlements) {
    if (settlement.deletedAt) continue;
    // Completed-balance contract: draft, requested, pending_confirmation,
    // failed, cancelled, and disputed settlements do NOT move balances
    // ("Pending settlements do not affect completed balances"; a payment
    // awaiting receiver confirmation must not count yet).
    //
    // REVERSAL PAIRS: a `reversed` original and its reversal record (a
    // separate `completed` settlement with SWAPPED from/to) must BOTH be
    // counted — the pair cancels to zero, which is the documented net
    // effect ("the balance is as if the original settlement never
    // happened" / "reversing restores exact previous balances").
    // Excluding the reversed original while counting its reversal would
    // INVERT the payment (the ledger would claim the money moved the
    // opposite way). A missing `status` (pre-Phase-6 row) hydrates as
    // completed.
    const status = settlement.status ?? 'completed';
    const countsInBalance =
      status === 'completed' || status === 'reversed';
    if (!countsInBalance) continue;
    const fromKey = settlement.fromMemberId as string;
    const toKey = settlement.toMemberId as string;
    if (sentMap.has(fromKey)) {
      sentMap.set(fromKey, (sentMap.get(fromKey) ?? 0) + settlement.amountMinor);
    } else {
      // Settlement references unknown member — flag it.
      skippedUnknownMember = true;
    }
    if (receivedMap.has(toKey)) {
      receivedMap.set(toKey, (receivedMap.get(toKey) ?? 0) + settlement.amountMinor);
    } else {
      skippedUnknownMember = true;
    }
  }

  // Step 4: Compute per-member balances.
  const memberBalances: MemberBalance[] = input.members.map((member) => {
    const key = member as string;
    const paid = paidMap.get(key) ?? 0;
    const share = shareMap.get(key) ?? 0;
    const sent = sentMap.get(key) ?? 0;
    const received = receivedMap.get(key) ?? 0;
    return {
      memberId: member,
      paidMinor: paid,
      shareMinor: share,
      settlementsSentMinor: sent,
      settlementsReceivedMinor: received,
      netBalanceMinor: paid - share - received + sent,
    };
  });

  // Step 5: Generate suggested transfers.
  const suggestedTransfers = generateSuggestedTransfers(memberBalances);

  // Step 6: Build explanations map.
  const explanations = new Map<string, readonly BalanceExplanationEntry[]>();
  for (const [key, entries] of perMemberExpenses) {
    explanations.set(key, entries);
  }

  // Verify the conservation invariant: Σ netBalanceMinor === 0.
  const totalNet = memberBalances.reduce((acc, b) => acc + b.netBalanceMinor, 0);
  const isBalanced = totalNet === 0;

  // Compute the richer validation status:
  //   - 'balanced' if totalNet === 0 and no unknown members were skipped.
  //   - 'incomplete_membership' if totalNet !== 0 because members were skipped.
  //   - 'data_corruption' if totalNet !== 0 but no members were skipped.
  let validationStatus: BalanceValidationStatus;
  if (totalNet === 0) {
    validationStatus = 'balanced';
  } else if (skippedUnknownMember) {
    validationStatus = 'incomplete_membership';
  } else {
    validationStatus = 'data_corruption';
  }

  return {
    groupId: input.groupId,
    currency: input.currency,
    memberBalances,
    suggestedTransfers,
    explanations,
    isBalanced,
    validationStatus,
    diagnostics,
  };
}

/**
 * Greedy settlement suggestion algorithm.
 *
 * 1. Split members into debtors (net < 0) and creditors (net > 0).
 * 2. Sort each group by absolute amount DESC (largest first).
 * 3. Greedily match the largest debtor to the largest creditor, transferring
 *    the smaller of the two amounts.
 * 4. Repeat until all debts are settled (or all credits are exhausted).
 *
 * This algorithm is NOT globally optimal (minimizing the number of transfers
 * is an NP-hard problem in general). It is, however, deterministic and
 * produces results that preserve all net balances exactly.
 *
 * The algorithm never changes the underlying net balances — it only suggests
 * transfers that, if executed, would zero them out.
 */
export function generateSuggestedTransfers(
  balances: readonly MemberBalance[],
): SuggestedTransfer[] {
  // Make mutable copies of debtor and creditor amounts.
  interface Side {
    memberId: MemberId;
    amount: number; // positive absolute value
  }
  const debtors: Side[] = [];
  const creditors: Side[] = [];

  for (const b of balances) {
    if (b.netBalanceMinor < 0) {
      debtors.push({ memberId: b.memberId, amount: -b.netBalanceMinor });
    } else if (b.netBalanceMinor > 0) {
      creditors.push({ memberId: b.memberId, amount: b.netBalanceMinor });
    }
  }

  // Sort by amount DESC, then by memberId ASC for determinism using a
  // plain string comparison (NOT localeCompare, which is locale-dependent).
  const sortByAmountDesc = (a: Side, b: Side) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    const sa = a.memberId as string;
    const sb = b.memberId as string;
    if (sa < sb) return -1;
    if (sa > sb) return 1;
    return 0;
  };
  debtors.sort(sortByAmountDesc);
  creditors.sort(sortByAmountDesc);

  const transfers: SuggestedTransfer[] = [];
  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];
    if (!debtor || !creditor) break;

    const transferAmount = Math.min(debtor.amount, creditor.amount);
    if (transferAmount > 0) {
      transfers.push({
        fromMemberId: debtor.memberId,
        toMemberId: creditor.memberId,
        amountMinor: transferAmount,
      });
    }

    debtor.amount -= transferAmount;
    creditor.amount -= transferAmount;

    if (debtor.amount === 0) dIdx++;
    if (creditor.amount === 0) cIdx++;
  }

  return transfers;
}

/**
 * Build a human-readable explanation for a member's net balance.
 *
 * @example
 *   "A paid ₹1,200. A's share was ₹300. A should receive ₹900."
 */
export function explainMemberBalance(
  balance: MemberBalance,
  memberName: string,
  currency: CurrencyCode,
): string {
  const paid = Money.fromMinor(balance.paidMinor, currency);
  const share = Money.fromMinor(balance.shareMinor, currency);
  const net = Money.fromMinor(balance.netBalanceMinor, currency);

  if (balance.netBalanceMinor > 0) {
    return (
      `${memberName} paid ${formatMoney(paid)}. ` +
      `${memberName}'s share was ${formatMoney(share)}. ` +
      `${memberName} should receive ${formatMoney(net)}.`
    );
  } else if (balance.netBalanceMinor < 0) {
    // v2.5.0 FIX: `net.multiply(-1)` threw for EVERY debtor — Money.multiply
    // rejects negative factors (by design, it is for quantities, not
    // sign flips). Build the absolute-value amount directly instead.
    const owed = Money.fromMinor(-balance.netBalanceMinor, currency);
    return (
      `${memberName} paid ${formatMoney(paid)}. ` +
      `${memberName}'s share was ${formatMoney(share)}. ` +
      `${memberName} owes ${formatMoney(owed)}.`
    );
  } else {
    return (
      `${memberName} paid ${formatMoney(paid)}. ` +
      `${memberName}'s share was ${formatMoney(share)}. ` +
      `${memberName} is settled.`
    );
  }
}

/**
 * Format Money as "INR 1250.50" (currency code + major.minor) using only
 * integer arithmetic. Avoids the floating-point precision loss of
 * `money.toMajor().toFixed(2)` (e.g. a minor amount of 105 in a 2-decimal
 * currency would render as `1.05` exactly here, whereas `toFixed(2)` on the
 * major value can produce artefacts for very large or very small amounts).
 *
 * Honors each currency's `decimalPlaces` setting (e.g. JPY has 0 decimals,
 * so `formatMoney(Money.fromMinor(105, 'JPY'))` returns `"JPY 105"`);
 * unknown currencies default to 2 decimal places. Pure utility for
 * explanation output.
 */
export function formatMoney(money: Money): string {
  const currencyCode = money.getCurrency();
  const minor = money.toMinor();
  const decimals = getCurrency(currencyCode)?.decimalPlaces ?? 2;
  const divisor = Math.pow(10, decimals);
  const majorPart = Math.floor(Math.abs(minor) / divisor);
  const minorPart = Math.abs(minor) % divisor;
  const sign = minor < 0 ? '-' : '';
  return `${currencyCode} ${sign}${majorPart}.${minorPart.toString().padStart(decimals, '0')}`;
}

function validateBalanceInput(input: BalanceEngineInput): void {
  if (input.members.length === 0) {
    throw new BalanceValidationError('BalanceEngine: members list is empty');
  }

  // Check for duplicate members.
  const seen = new Set<string>();
  for (const m of input.members) {
    const key = m as string;
    if (seen.has(key)) {
      throw new BalanceValidationError(`BalanceEngine: duplicate member ${m}`);
    }
    seen.add(key);
  }

  // Validate all expense currencies match the group currency (Phase 1 single-currency).
  for (const expense of input.expenses) {
    if (expense.currencyCode !== input.currency) {
      throw new BalanceValidationError(
        `BalanceEngine: expense ${expense.id} currency ${expense.currencyCode} does not match group currency ${input.currency}`,
      );
    }
  }

  // Validate all settlement currencies match the group currency.
  for (const settlement of input.settlements) {
    if (settlement.currencyCode !== input.currency) {
      throw new BalanceValidationError(
        `BalanceEngine: settlement ${settlement.id} currency ${settlement.currencyCode} does not match group currency ${input.currency}`,
      );
    }
  }
}

// =============================================================================
// Phase 6 Track 3 — Multi-currency balance engine (additive)
// =============================================================================
//
// The spec (Prompt 51) requires per-currency balance separation:
//
//   "Never combine £30 owed and ₹2,000 receivable into a single net
//    amount. Return separate balance summaries per currency."
//
// The original `calculateGroupBalances` function (above) throws
// `BalanceValidationError` on currency mismatch — it is the Phase 1
// single-currency entry point. We keep it unchanged for backwards
// compatibility: every existing caller and test continues to use it.
//
// The new `calculateGroupBalancesByCurrency` function (below) is the
// Phase 6 multi-currency entry point. It accepts a single input
// containing expenses and settlements in ANY currencies, partitions
// them by currency, runs the existing single-currency logic per
// currency, and returns one `CurrencyBalanceResult` per currency
// present in the input. The zero-sum invariant is enforced PER
// CURRENCY, not globally.
//
// The `MemberCurrencyBalance` interface extends `MemberBalance` with
// the spec-required fields: `currencyCode`, `expenseCount`,
// `settlementCount`, `calculatedAt`, `sourceVersion`. The existing
// `MemberBalance` interface is unchanged so existing callers keep
// working.

/**
 * Per-member per-currency balance breakdown — Phase 6 Prompt 51.
 *
 * Extends `MemberBalance` with the spec-required fields:
 *   - `currencyCode` — which currency this balance is for
 *   - `expenseCount` — number of expenses this member contributed to
 *     (paid or shared) in this currency
 *   - `settlementCount` — number of settlements this member was a
 *     party to (sender or receiver) in this currency
 *
 * The `calculatedAt` and `sourceVersion` fields live on the parent
 * `CurrencyBalanceResult` (one timestamp + one version per currency
 * result, not per member).
 */
export interface MemberCurrencyBalance extends MemberBalance {
  readonly currencyCode: CurrencyCode;
  readonly expenseCount: number;
  readonly settlementCount: number;
}

/**
 * Per-currency balance result — Phase 6 Prompt 51.
 *
 * One `CurrencyBalanceResult` per currency present in the input.
 * Each result contains the same data as a `BalanceResult` plus the
 * spec-required fields: `currencyCode` (also in `currency` for
 * backwards compat), `calculatedAt` (when the calculation ran),
 * `sourceVersion` (a hash of the input source for cache invalidation).
 *
 * The zero-sum invariant (`isBalanced`) is enforced PER CURRENCY —
 * `memberCurrencyBalances` sum to zero within each result.
 */
export interface CurrencyBalanceResult extends BalanceResult {
  /** Same as `currency` — duplicated for explicit per-currency access. */
  readonly currencyCode: CurrencyCode;
  /** Per-member per-currency balances (extends MemberBalance). */
  readonly memberCurrencyBalances: readonly MemberCurrencyBalance[];
  /** When the calculation ran. ISO date-time UTC. */
  readonly calculatedAt: DateTime;
  /**
   * Hash of the input source — the ids and versions of the expenses,
   * settlements, and members used. Used by the balance cache (future
   * work) to detect staleness: if the sourceVersion changes, the
   * cached result must be discarded.
   *
   * Format: a short hex string (8 chars) derived from a sha256 of
   * the sorted expense ids + versions, settlement ids + versions,
   * and member ids. Not a security hash — just a stable fingerprint.
   */
  readonly sourceVersion: string;
}

/**
 * Input for the multi-currency balance engine.
 *
 * Same shape as `BalanceEngineInput` but WITHOUT the `currency`
 * field — the engine detects currencies from the input. Each
 * expense and settlement carries its own `currencyCode`.
 *
 * If the input contains no expenses and no settlements, the result
 * is an empty array (no currencies to compute).
 */
export interface MultiCurrencyBalanceEngineInput {
  readonly groupId: string;
  readonly members: readonly MemberId[];
  readonly expenses: readonly Expense[];
  readonly payers: readonly ExpensePayer[];
  readonly splits: readonly ExpenseSplit[];
  readonly settlements: readonly Settlement[];
}

/**
 * Multi-currency balance engine — Phase 6 Prompt 51.
 *
 * Partitions the input by currency, runs the existing single-currency
 * `calculateGroupBalances` per currency, and returns one
 * `CurrencyBalanceResult` per currency present in the input.
 *
 * Per-currency zero-sum invariant: each result's
 * `memberCurrencyBalances` sum to zero (or the result is flagged
 * with the appropriate `validationStatus`).
 *
 * Spec rule: "Never combine £30 owed and ₹2,000 receivable into a
 * single net amount." This function returns them as separate results,
 * never combined.
 *
 * Spec rule: "Run simplification separately for each currency. Never
 * suggest 'Pay £10 to offset ₹1,000'." Each result's
 * `suggestedTransfers` are within the same currency.
 *
 * The order of the returned array is deterministic: currencies are
 * sorted alphabetically by ISO code (e.g. EUR before GBP before INR
 * before USD) for stable test output and UI rendering.
 *
 * @example
 *   const results = calculateGroupBalancesByCurrency({
 *     groupId: 'g1',
 *     members: [asMemberId('a'), asMemberId('b')],
 *     expenses: [/* mixed GBP and INR expenses *\/],
 *     payers: [...],
 *     splits: [...],
 *     settlements: [/* mixed GBP and INR settlements *\/],
 *   });
 *   // results[0] is the GBP result, results[1] is the INR result
 *   // Each is a fully-formed CurrencyBalanceResult with its own
 *   // zero-sum invariant, suggested transfers, and explanations.
 */
export function calculateGroupBalancesByCurrency(
  input: MultiCurrencyBalanceEngineInput,
): CurrencyBalanceResult[] {
  // 1. Collect all currencies present in the input.
  const currencySet = new Set<CurrencyCode>();
  for (const expense of input.expenses) {
    if (!expense.deletedAt) currencySet.add(expense.currencyCode);
  }
  for (const settlement of input.settlements) {
    if (!settlement.deletedAt) currencySet.add(settlement.currencyCode);
  }
  // Even if a currency has no expenses/settlements, we still want to
  // emit a zero-result if it was explicitly requested. There is no
  // "explicitly requested" list in the input (we removed `currency`),
  // so we only emit results for currencies that appear in the data.
  // If the input has no expenses and no settlements, return [].

  if (currencySet.size === 0) {
    return [];
  }

  // 2. For each currency, partition the input and call the
  //    single-currency engine.
  const currencies = Array.from(currencySet).sort();
  const results: CurrencyBalanceResult[] = [];

  for (const currency of currencies) {
    const currencyExpenses = input.expenses.filter(
      (e) => e.currencyCode === currency,
    );
    const currencyExpenseIds = new Set(currencyExpenses.map((e) => e.id as string));
    const currencyPayers = input.payers.filter(
      (p) => currencyExpenseIds.has(p.expenseId as string),
    );
    const currencySplits = input.splits.filter(
      (s) => currencyExpenseIds.has(s.expenseId as string),
    );
    const currencySettlements = input.settlements.filter(
      (s) => s.currencyCode === currency,
    );

    // Run the single-currency engine. The single-currency engine
    // throws on currency mismatch, but we have already filtered
    // so all currencies match. The throw is therefore unreachable
    // for the filtered subset.
    const singleResult = calculateGroupBalances({
      groupId: input.groupId,
      currency,
      members: input.members,
      expenses: currencyExpenses,
      payers: currencyPayers,
      splits: currencySplits,
      settlements: currencySettlements,
    });

    // 3. Build the per-member per-currency balances with the
    //    spec-required extra fields.
    const memberCurrencyBalances: MemberCurrencyBalance[] = singleResult.memberBalances.map(
      (mb) => {
        // Count expenses this member contributed to (paid or shared)
        // in this currency. We look at the explanations map because
        // it already excludes unknown members and soft-deleted
        // payers/splits.
        const memberExpenses = singleResult.explanations.get(mb.memberId as string) ?? [];
        // Count settlements this member was a party to in this
        // currency. We have already filtered settlements by currency;
        // we just need to count those involving this member.
        let settlementCount = 0;
        for (const s of currencySettlements) {
          if (s.deletedAt) continue;
          if (s.fromMemberId === mb.memberId || s.toMemberId === mb.memberId) {
            settlementCount++;
          }
        }
        return {
          ...mb,
          currencyCode: currency,
          expenseCount: memberExpenses.length,
          settlementCount,
        };
      },
    );

    // 4. Build the source version hash — a stable fingerprint of
    //    the input. We hash the sorted expense ids + versions and
    //    settlement ids + versions and member ids. This is NOT a
    //    security hash — just a stable cache key.
    const sourceVersion = computeSourceVersion(
      currencyExpenses,
      currencySettlements,
      input.members,
    );

    results.push({
      ...singleResult,
      currencyCode: currency,
      memberCurrencyBalances,
      calculatedAt: nowDateTime(),
      sourceVersion,
    });
  }

  return results;
}

/**
 * Compute a stable source-version fingerprint for a per-currency
 * balance result.
 *
 * The fingerprint is an 8-character hex string derived from a sha256
 * of the sorted expense ids + versions, settlement ids + versions,
 * and member ids. It is NOT a security hash — it is a cache key that
 * lets the balance cache (future work) detect staleness.
 *
 * Two balance results with the same source version are guaranteed to
 * have been computed from the same input data (modulo hash
 * collisions, which are astronomically unlikely for this use case).
 */
function computeSourceVersion(
  expenses: readonly Expense[],
  settlements: readonly Settlement[],
  members: readonly MemberId[],
): string {
  // Build a stable string representation. Sort each list by id so
  // reordering does not change the hash.
  const expensePart = expenses
    .filter((e) => !e.deletedAt)
    .map((e) => `${e.id as string}:v${e.version as number}`)
    .sort()
    .join('|');
  const settlementPart = settlements
    .filter((s) => !s.deletedAt)
    .map((s) => `${s.id as string}:v${s.version as number}`)
    .sort()
    .join('|');
  const memberPart = (members as readonly string[])
    .slice()
    .sort()
    .join('|');
  const source = `${expensePart}#${settlementPart}#${memberPart}`;

  // Compute a short hash. We use a simple FNV-1a-style hash because
  // the Web Crypto subtle.digest API is async and we want a sync
  // function. The hash does not need to be cryptographically secure;
  // it just needs to be stable and collision-resistant for the
  // expected input sizes (groups with <10,000 expenses/settlements).
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    // FNV prime (32-bit): 16777619
    hash = Math.imul(hash, 0x01000193);
  }
  // Mask to 32 bits and convert to 8-char hex.
  const masked = hash >>> 0;
  return masked.toString(16).padStart(8, '0');
}

// =============================================================================
// Phase 6 Track 3 — Per-currency zero-sum invariant validation
// =============================================================================

/**
 * Validate the per-currency zero-sum invariant for a set of
 * per-currency balance results.
 *
 * For each `CurrencyBalanceResult`, the sum of
 * `memberCurrencyBalances[].netBalanceMinor` must equal zero (or the
 * result must be flagged with `validationStatus !== 'balanced'`).
 *
 * Returns an array of validation failures. Empty array means every
 * result honours the invariant. Non-empty means one or more
 * currencies have a corrupted balance — the UI should display an
 * integrity warning and the audit system should record an event.
 *
 * Spec rule (Prompt 51): "For every group and currency: sum of all
 * member net balances = 0. Fail loudly in development and record a
 * safe integrity event in production if the invariant breaks. Do
 * not silently insert a balancing adjustment."
 */
export interface BalanceInvariantFailure {
  readonly groupId: string;
  readonly currencyCode: CurrencyCode;
  readonly totalNet: number;
  readonly validationStatus: BalanceValidationStatus;
}

export function validateBalanceInvariants(
  results: readonly CurrencyBalanceResult[],
): readonly BalanceInvariantFailure[] {
  const failures: BalanceInvariantFailure[] = [];
  for (const r of results) {
    const totalNet = r.memberCurrencyBalances.reduce(
      (acc, b) => acc + b.netBalanceMinor,
      0,
    );
    if (totalNet !== 0 || r.validationStatus !== 'balanced') {
      failures.push({
        groupId: r.groupId,
        currencyCode: r.currencyCode,
        totalNet,
        validationStatus: r.validationStatus,
      });
    }
  }
  return failures;
}
