/**
 * Financial conflict rules for encrypted sync.
 *
 * Silent last-write-wins is forbidden for money. This module defines the
 * minimum safe rule for expense events: if the same expense id already
 * exists locally and any financial field differs, the incoming event is a
 * conflict — it is recorded for review, never applied.
 *
 * The rule is deliberately conservative: even an "identical" event is
 * compared field by field. A remote event that changes only the title is
 * allowed; one that changes amount, currency, payer or participants is not.
 */

export interface ExpenseFinancialSnapshot {
  readonly id: string;
  readonly version: number;
  readonly amountMinor: number;
  readonly currencyCode: string;
  readonly payerSignature: string;
  readonly participantSignature: string;
}

export interface FinancialConflictDetails {
  readonly entityType: string;
  readonly entityId: string;
  readonly localVersion: number;
  readonly remoteVersion: number;
  readonly localPayload: string;
  readonly remotePayload: string;
  readonly reason: string;
}

export class FinancialConflictError extends Error {
  constructor(readonly conflict: FinancialConflictDetails) {
    super(conflict.reason);
    this.name = 'FinancialConflictError';
  }
}

export function expenseFinancialSignature(input: {
  readonly amountMinor: number;
  readonly currencyCode: string;
  readonly payerContributions: readonly { readonly memberId: string; readonly amountMinor: number }[];
  readonly participantIds: readonly string[];
}): Pick<ExpenseFinancialSnapshot, 'payerSignature' | 'participantSignature'> {
  const payerSignature = [...input.payerContributions]
    .map((payer) => `${payer.memberId}:${payer.amountMinor}`)
    .sort()
    .join('|');
  const participantSignature = [...input.participantIds].sort().join('|');
  return { payerSignature, participantSignature };
}

/**
 * Throw when a local expense and an incoming event disagree on money.
 * Returns normally when local is absent (create) or the financial fields
 * are identical (idempotent replay / non-financial edit).
 */
export function assertExpenseEventApplicable(input: {
  readonly local: ExpenseFinancialSnapshot | null;
  readonly remote: ExpenseFinancialSnapshot;
  readonly localPayload: unknown;
  readonly remotePayload: unknown;
}): void {
  const { local, remote } = input;
  if (local === null) return;

  const sameMoney =
    local.amountMinor === remote.amountMinor &&
    local.currencyCode === remote.currencyCode &&
    local.payerSignature === remote.payerSignature &&
    local.participantSignature === remote.participantSignature;

  if (sameMoney) return;

  throw new FinancialConflictError({
    entityType: 'expense',
    entityId: remote.id,
    localVersion: local.version,
    remoteVersion: remote.version,
    localPayload: JSON.stringify(input.localPayload),
    remotePayload: JSON.stringify(input.remotePayload),
    reason: 'Incoming expense changes financial fields that differ locally.',
  });
}
