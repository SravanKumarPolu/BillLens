import { InvalidStateTransitionError } from '../../errors/invalid-state-transition.error';

/**
 * Settlement State Machine — Phase 6, Prompt 52.
 *
 * BillLens settlements follow an explicit 8-state lifecycle. Every
 * transition is whitelisted; any transition not on the whitelist throws
 * `InvalidStateTransitionError`.
 *
 * The state machine is a PURE module: it has no side effects, no I/O,
 * no React Native / SQLite / Supabase dependencies. It operates on
 * plain strings. This makes it trivially unit-testable and reusable
 * from the entity factory, the use cases, and the sync conflict
 * resolver.
 *
 * ── Why an explicit state machine ──
 *
 * The Phase 6 spec is unambiguous: "BillLens must never claim
 * 'Payment completed' only because a UPI deep link was opened, a QR
 * code was displayed, a payment screenshot was attached, the user
 * left BillLens and returned, or a payment reference was manually
 * entered." The MVP policy is:
 *
 *   User records settlement
 *        ↓
 *   Status becomes pending_confirmation
 *        ↓
 *   Receiver confirms
 *        ↓
 *   Status becomes completed
 *
 * Without an explicit state machine, the balance engine cannot honour
 * "Pending settlements do not affect completed balances" — it has no
 * way to distinguish a pending settlement from a completed one. This
 * module is the keystone that makes the safety principle enforceable
 * by construction rather than by discipline.
 *
 * ── The eight states ──
 *
 *   draft               — created but not yet sent or recorded
 *   requested           — payer has asked the receiver to settle
 *   pending_confirmation — payer has recorded a payment; awaiting receiver
 *   completed           — receiver has confirmed (or self-cash with policy)
 *   failed              — receiver rejected; can be retried from draft
 *   cancelled           — abandoned by either party; terminal
 *   disputed            — receiver disputes; awaiting resolution
 *   reversed            — completed settlement undone via new reversal record
 *   deleted             — soft-deleted; preserved for audit (see Settlement.deletedAt)
 *
 * Note: `deleted` is encoded as a soft-delete flag on the entity
 * (`deletedAt`), NOT as a status value. The state machine therefore
 * deals with eight status values; the ninth state is the soft-delete
 * binary flag managed by `softDeleteSettlement`.
 */

// ---------------------------------------------------------------------------
// Status type
// ---------------------------------------------------------------------------

export type SettlementStatus =
  | 'draft'
  | 'requested'
  | 'pending_confirmation'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'disputed'
  | 'reversed';

/**
 * All valid status values, in stable order. Used by tests, schema
 * validators, and serialisation guards.
 */
export const ALL_SETTLEMENT_STATUSES: readonly SettlementStatus[] = [
  'draft',
  'requested',
  'pending_confirmation',
  'completed',
  'failed',
  'cancelled',
  'disputed',
  'reversed',
];

/**
 * Terminal states — once entered, the settlement cannot transition to
 * any other status (though it can still be soft-deleted for audit).
 *
 * `reversed` and `cancelled` are terminal. `completed` is NOT terminal
 * because a completed settlement can still be reversed (correction
 * flow). `disputed` is NOT terminal because disputes can be resolved
 * into `completed` or `cancelled`.
 */
export const TERMINAL_STATUSES: readonly SettlementStatus[] = [
  'cancelled',
  'reversed',
];

/**
 * Coerce an unknown string into a SettlementStatus, or throw.
 *
 * Used by the repository layer when hydrating settlements from storage
 * (where the column is a text/enum and could in principle contain an
 * unexpected value during a partial migration).
 */
export function asSettlementStatus(value: string): SettlementStatus {
  if (ALL_SETTLEMENT_STATUSES.includes(value as SettlementStatus)) {
    return value as SettlementStatus;
  }
  throw new InvalidStateTransitionError(
    `Unknown settlement status: "${value}"`,
    '(unknown)',
    value,
  );
}

/**
 * Returns true if the status is one of the eight valid values.
 * Does not throw. Used for input validation in use cases.
 */
export function isValidSettlementStatus(value: unknown): value is SettlementStatus {
  return typeof value === 'string'
    && ALL_SETTLEMENT_STATUSES.includes(value as SettlementStatus);
}

// ---------------------------------------------------------------------------
// Transition table
// ---------------------------------------------------------------------------

/**
 * Whitelist of valid transitions. Each entry is `[from, to]`.
 *
 * The table is the single source of truth — `isValidTransition` and
 * `assertValidTransition` both derive their behaviour from it.
 *
 * The eleven transitions defined by Phase 6 Prompt 52:
 *
 *   draft → requested                  (payer requests settlement)
 *   draft → pending_confirmation       (payer records payment directly)
 *   draft → completed                  (self-cash with explicit policy)
 *   requested → pending_confirmation   (payer pays after requesting)
 *   requested → cancelled              (either party cancels request)
 *   pending_confirmation → completed   (receiver confirms)
 *   pending_confirmation → failed      (receiver rejects)
 *   pending_confirmation → cancelled   (either party cancels)
 *   pending_confirmation → disputed    (receiver disputes)
 *   completed → reversed               (correction via reversal record)
 *   failed → draft                     (retry from draft)
 *
 * Two additional transitions are added for the dispute-resolution
 * flow (Prompt 57):
 *
 *   disputed → completed               (dispute resolved, payment accepted)
 *   disputed → cancelled               (dispute resolved, payment rejected)
 *
 * Total: 13 valid transitions.
 */
export const VALID_TRANSITIONS: readonly [SettlementStatus, SettlementStatus][] = [
  // From draft
  ['draft', 'requested'],
  ['draft', 'pending_confirmation'],
  ['draft', 'completed'],

  // From requested
  ['requested', 'pending_confirmation'],
  ['requested', 'cancelled'],

  // From pending_confirmation
  ['pending_confirmation', 'completed'],
  ['pending_confirmation', 'failed'],
  ['pending_confirmation', 'cancelled'],
  ['pending_confirmation', 'disputed'],

  // From completed
  ['completed', 'reversed'],

  // From failed
  ['failed', 'draft'],

  // From disputed (resolution paths)
  ['disputed', 'completed'],
  ['disputed', 'cancelled'],
];

// ---------------------------------------------------------------------------
// Transition validation
// ---------------------------------------------------------------------------

/**
 * Returns true if the transition `from → to` is valid.
 *
 * Pure function — no side effects, no I/O.
 */
export function isValidTransition(
  from: SettlementStatus,
  to: SettlementStatus,
): boolean {
  return VALID_TRANSITIONS.some(
    ([f, t]) => f === from && t === to,
  );
}

/**
 * Throws `InvalidStateTransitionError` if the transition `from → to`
 * is not on the whitelist.
 *
 * Use this from entity factories and use cases — fail fast, fail loud.
 */
export function assertValidTransition(
  from: SettlementStatus,
  to: SettlementStatus,
): void {
  if (!isValidTransition(from, to)) {
    throw new InvalidStateTransitionError(
      `Invalid settlement transition: ${from} → ${to}`,
      from,
      to,
    );
  }
}

/**
 * Returns the list of valid next statuses from a given status.
 *
 * Useful for UI: render only the actions that are valid for the
 * current settlement state.
 */
export function validNextStatuses(from: SettlementStatus): readonly SettlementStatus[] {
  return VALID_TRANSITIONS
    .filter(([f]) => f === from)
    .map(([, t]) => t);
}

/**
 * Returns true if the status is terminal (no outgoing transitions
 * except soft-delete, which is not a status change).
 */
export function isTerminalStatus(status: SettlementStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Returns true if the status contributes to the completed balance as a
 * SINGLE record.
 *
 * The balance engine uses this to honour the spec rule "Pending
 * settlements do not affect completed balances". Only `completed`
 * settlements are included in the balance as standalone payments;
 * `pending_confirmation`, `disputed`, `failed`, `cancelled`,
 * `reversed`, `requested`, and `draft` are excluded.
 *
 * `reversed` returns false HERE because this function answers the
 * per-record question "is this record, alone, a completed payment?".
 * The BALANCE ENGINE nevertheless counts a reversed original together
 * with its reversal record: the reversal (a separate `completed`
 * settlement with swapped from/to) cancels the original only when BOTH
 * are in the balance — the pair nets to zero, which is the documented
 * net effect ("the balance is as if the original settlement never
 * happened"). Excluding the reversed original while counting its
 * reversal would invert the payment. See `calculateGroupBalances`
 * step 3 for the composition.
 *
 * NOTE: This function is the contract between the state machine and
 * the balance engine. Any change here requires a corresponding change
 * in `calculateGroupBalances`.
 */
export function contributesToCompletedBalance(status: SettlementStatus): boolean {
  return status === 'completed';
}

/**
 * Returns true if the status should be displayed in the
 * "pending impact" section of the balance UI (separate from the
 * completed balance).
 *
 * Per the spec: "Pending settlements do not affect completed balances"
 * but the UI MAY display pending impact separately.
 */
export function isPendingStatus(status: SettlementStatus): boolean {
  return status === 'pending_confirmation' || status === 'requested';
}
