import type { GroupId, MemberId, SettlementId, UserId } from '@shared-types/index';

import { DeletedEntityError, InvalidEntityError, VersionConflictError } from '../errors/index';
import {
  type SettlementStatus,
  assertValidTransition,
  contributesToCompletedBalance,
  isValidSettlementStatus,
} from '../services/settlements/settlement-state-machine';
import {
  type CurrencyCode,
  type DateTime,
  type VersionNumber,
  asCurrencyCode,
  asDateTime,
  initialVersionNumber,
  nextVersionNumber,
  nowDateTime,
} from '../value-objects/index';


export function asSettlementId(value: string): SettlementId {
  return value as SettlementId;
}

/**
 * Settlement method — the channel through which the payment was made.
 *
 * Phase 6 Prompt 52 requires support for: cash, upi, bank_transfer,
 * card, wallet, other. The four pre-existing values (cash, upi,
 * bank_transfer, other) are unchanged; `card` and `wallet` are added
 * in this Phase 6 Track 1 expansion.
 */
export type SettlementMethod = 'cash' | 'upi' | 'bank_transfer' | 'card' | 'wallet' | 'other';

/**
 * All valid settlement methods, in stable order. Used by tests,
 * schema validators, and UI pickers.
 */
export const ALL_SETTLEMENT_METHODS: readonly SettlementMethod[] = [
  'cash',
  'upi',
  'bank_transfer',
  'card',
  'wallet',
  'other',
];

/**
 * A settlement is a payment from one member to another to reduce their
 * outstanding balance.
 *
 * IMPORTANT: A settlement is a SEPARATE financial record — it does NOT
 * modify any expense. Reversing a settlement uses a new adjustment record
 * rather than mutating financial history.
 *
 * Sign convention:
 *   - `fromMemberId` is the payer (settles their debt).
 *   - `toMemberId` is the payee (receives the payment).
 *   - `amountMinor` is always positive.
 *
 * ── Phase 6 Track 1 additions ──
 *
 * The following fields are added to support the Phase 6 state machine
 * (Prompt 52) and the receiver-confirmation / dispute flows (Prompts
 * 57-58). All are OPTIONAL on the entity so that existing rows hydrate
 * cleanly from a partial migration:
 *
 *   - `status` — the lifecycle state. Defaults to `'completed'` for
 *     backwards compatibility: settlements created by the pre-Phase-6
 *     `createSettlement` factory (used by every existing test and the
 *     balance engine) are treated as completed so the balance engine
 *     continues to count them exactly as before.
 *
 *   - `confirmedByMemberId` — set when the receiver confirms a
 *     `pending_confirmation` settlement. Required for the audit trail
 *     ("who confirmed this?").
 *
 *   - `confirmedAt` — timestamp of the confirmation.
 *
 *   - `paymentReferenceHash` — sha256 of the user-entered payment
 *     reference (UPI UTR, bank RRN, etc.). NEVER store the raw reference
 *     on the entity — only the hash. Used for duplicate detection.
 *
 *   - `operationId` — client-generated stable UUID for offline
 *     idempotency. Two settlements with the same `operationId` are the
 *     same intended write.
 *
 *   - `evidenceHash` — sha256 of the attached evidence file. Used for
 *     duplicate-evidence detection.
 *
 *   - `disputeReason` — structured reason code if `status === 'disputed'`.
 *     One of: `not_received`, `wrong_amount`, `wrong_currency`,
 *     `wrong_sender`, `duplicate`, `failed`, `reversed`, `other`.
 *
 *   - `disputeNote` — optional free-text note accompanying a dispute.
 *
 * The `status` field interacts with the balance engine through the
 * `contributesToCompletedBalance(status)` pure function defined in
 * `settlement-state-machine.ts`. The balance engine is the consumer
 * of that contract.
 */
export interface Settlement {
  readonly id: SettlementId;
  readonly groupId: GroupId;
  readonly fromMemberId: MemberId;
  readonly toMemberId: MemberId;
  readonly amountMinor: number;
  readonly currencyCode: CurrencyCode;
  readonly method: SettlementMethod;
  readonly settlementDate: DateTime;
  readonly note?: string;
  readonly createdBy: UserId;
  readonly createdAt: DateTime;
  readonly updatedAt: DateTime;
  readonly deletedAt?: DateTime;
  readonly version: VersionNumber;
  /**
   * If this settlement is the ORIGINAL (reversed) settlement, this field
   * points to the reversal settlement that cancels it out. Set when a
   * reversal is created alongside updating the original.
   */
  readonly reversesSettlementId?: SettlementId;
  /**
   * If this settlement is itself a REVERSAL, this field points to the
   * original settlement that it reverses. Set by `createSettlementReversal`.
   */
  readonly reversalOfSettlementId?: SettlementId;

  // ── Phase 6 Track 1 additions ────────────────────────────────────
  /**
   * Lifecycle status. Defaults to 'completed' for backwards
   * compatibility with pre-Phase-6 rows.
   */
  readonly status?: SettlementStatus;
  /**
   * Member who confirmed the settlement (the receiver). Set on
   * `confirmSettlement`. Required for the audit trail.
   */
  readonly confirmedByMemberId?: MemberId;
  /** Timestamp of the receiver confirmation. */
  readonly confirmedAt?: DateTime;
  /**
   * sha256 (hex) of the user-entered payment reference. NEVER store
   * the raw reference on the entity — only the hash.
   */
  readonly paymentReferenceHash?: string;
  /**
   * Client-generated stable UUID for offline idempotency. Two
   * settlements with the same operationId are the same intended write.
   */
  readonly operationId?: string;
  /** sha256 (hex) of the attached evidence file, for duplicate detection. */
  readonly evidenceHash?: string;
  /** Structured dispute reason. Set only when `status === 'disputed'`. */
  readonly disputeReason?: SettlementDisputeReason;
  /** Optional free-text note accompanying a dispute. */
  readonly disputeNote?: string;
}

/**
 * Structured dispute reason taxonomy — Phase 6 Prompt 57.
 *
 * The reasons are deliberately enumerated (not free-text) so the UI
 * can render consistent badges and analytics can aggregate cleanly.
 * The optional `disputeNote` field allows free-text context.
 */
export type SettlementDisputeReason =
  | 'not_received'        // Payment not received
  | 'wrong_amount'        // Wrong amount
  | 'wrong_currency'      // Wrong currency
  | 'wrong_sender'         // Wrong sender
  | 'duplicate'            // Duplicate settlement
  | 'failed'               // Payment failed
  | 'reversed'             // Payment was reversed externally
  | 'other';               // Other (note required)

export const ALL_DISPUTE_REASONS: readonly SettlementDisputeReason[] = [
  'not_received',
  'wrong_amount',
  'wrong_currency',
  'wrong_sender',
  'duplicate',
  'failed',
  'reversed',
  'other',
];

export interface SettlementCreateInput {
  readonly id: SettlementId;
  readonly groupId: GroupId;
  readonly fromMemberId: MemberId;
  readonly toMemberId: MemberId;
  readonly amountMinor: number;
  readonly currencyCode: string;
  readonly method: SettlementMethod;
  readonly settlementDate?: string;
  readonly note?: string;
  readonly createdBy: UserId;
  readonly now?: DateTime;
  /**
   * Initial lifecycle status. Defaults to `'completed'` for backwards
   * compatibility with pre-Phase-6 callers (the balance engine and
   * every existing test). New Phase 6 use cases should set this
   * explicitly (typically `'draft'` for a fresh draft, or
   * `'pending_confirmation'` for a recorded payment awaiting
   * confirmation).
   */
  readonly status?: SettlementStatus;
  /** Optional payment-reference hash for duplicate detection. */
  readonly paymentReferenceHash?: string;
  /** Optional client-generated idempotency key for offline creation. */
  readonly operationId?: string;
  /** Optional evidence hash for duplicate-evidence detection. */
  readonly evidenceHash?: string;
}

/**
 * Create a Settlement entity.
 *
 * Defaults `status` to `'completed'` for backwards compatibility:
 * pre-Phase-6 callers (the balance engine, the existing test suite,
 * the existing settlement-engine tests) all expect that a freshly
 * created settlement contributes to the balance immediately. The
 * new Phase 6 use cases set `status` explicitly through the dedicated
 * transition functions (`recordSettlement`, `requestSettlement`,
 * `confirmSettlement`, etc.) rather than changing the default here.
 */
export function createSettlement(input: SettlementCreateInput): Settlement {
  if (input.fromMemberId === input.toMemberId) {
    throw new InvalidEntityError(
      `Settlement from and to members cannot be the same: ${input.fromMemberId}`,
    );
  }
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new InvalidEntityError(
      `Settlement amount must be a positive integer, got ${input.amountMinor}`,
    );
  }
  if (!Number.isSafeInteger(input.amountMinor)) {
    throw new InvalidEntityError(
      `Settlement amount outside safe integer range: ${input.amountMinor}`,
    );
  }
  if (input.status !== undefined && !isValidSettlementStatus(input.status)) {
    throw new InvalidEntityError(
      `Settlement status is not a valid value: "${input.status}"`,
    );
  }
  if (input.paymentReferenceHash !== undefined) {
    if (!/^[a-f0-9]{64}$/.test(input.paymentReferenceHash)) {
      throw new InvalidEntityError(
        'paymentReferenceHash must be a 64-character lowercase hex sha256',
      );
    }
  }
  if (input.evidenceHash !== undefined) {
    if (!/^[a-f0-9]{64}$/.test(input.evidenceHash)) {
      throw new InvalidEntityError(
        'evidenceHash must be a 64-character lowercase hex sha256',
      );
    }
  }
  const now = input.now ?? nowDateTime();
  return {
    id: input.id,
    groupId: input.groupId,
    fromMemberId: input.fromMemberId,
    toMemberId: input.toMemberId,
    amountMinor: input.amountMinor,
    currencyCode: asCurrencyCode(input.currencyCode),
    method: input.method,
    settlementDate: asDateTime(input.settlementDate ?? now),
    ...(input.note !== undefined ? { note: input.note.trim() } : {}),
    createdBy: input.createdBy,
    createdAt: asDateTime(now),
    updatedAt: asDateTime(now),
    version: initialVersionNumber(),
    ...(input.status !== undefined ? { status: input.status } : { status: 'completed' }),
    ...(input.paymentReferenceHash !== undefined
      ? { paymentReferenceHash: input.paymentReferenceHash }
      : {}),
    ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
    ...(input.evidenceHash !== undefined ? { evidenceHash: input.evidenceHash } : {}),
  };
}

export interface SettlementSoftDeleteInput {
  readonly now?: DateTime;
  readonly expectedVersion: VersionNumber;
}

export function softDeleteSettlement(
  current: Settlement,
  input: SettlementSoftDeleteInput,
): Settlement {
  if (current.version !== input.expectedVersion) {
    throw new VersionConflictError(
      `Settlement version conflict: expected ${input.expectedVersion}, got ${current.version}`,
      input.expectedVersion as number,
      current.version as number,
    );
  }
  if (current.deletedAt) {
    throw new DeletedEntityError(
      `Settlement ${current.id} is already deleted`,
      'Settlement',
      current.id,
    );
  }
  const now = input.now ?? nowDateTime();
  return {
    ...current,
    deletedAt: asDateTime(now),
    updatedAt: asDateTime(now),
    version: nextVersionNumber(current.version),
  };
}

export function isSettlementActive(s: Settlement): boolean {
  return s.deletedAt === undefined;
}

/**
 * Returns true if the settlement should be counted in the completed
 * balance. The balance engine uses this; it is the contract surface
 * between the entity and the balance engine.
 *
 * Delegates to `contributesToCompletedBalance(status)` from the state
 * machine module. A settlement with no `status` field (pre-Phase-6
 * row hydrating from a partial migration) is treated as `'completed'`
 * for backwards compatibility.
 */
export function isSettlementCompleted(s: Settlement): boolean {
  const status = s.status ?? 'completed';
  return contributesToCompletedBalance(status);
}

// ---------------------------------------------------------------------------
// State transition functions — Phase 6 Track 1
// ---------------------------------------------------------------------------

/**
 * Common input for state-transition functions. Each transition:
 *   - Checks optimistic concurrency (expectedVersion)
 *   - Validates the transition via `assertValidTransition`
 *   - Bumps the version
 *   - Updates `updatedAt`
 *   - Returns a NEW Settlement object (no mutation)
 */
export interface SettlementTransitionInput {
  readonly expectedVersion: VersionNumber;
  readonly now?: DateTime;
}

/**
 * Transition: draft → requested.
 *
 * The payer has asked the receiver to settle. No payment has been
 * recorded yet.
 */
export function requestSettlement(
  current: Settlement,
  input: SettlementTransitionInput,
): Settlement {
  return applyTransition(current, 'requested', input);
}

/**
 * Transition: draft|requested → pending_confirmation.
 *
 * The payer has recorded a payment (e.g. launched UPI, attached
 * evidence, entered a reference). The settlement is now awaiting
 * receiver confirmation.
 */
export function recordSettlement(
  current: Settlement,
  input: SettlementTransitionInput & {
    readonly paymentReferenceHash?: string;
    readonly evidenceHash?: string;
  },
): Settlement {
  const updated = applyTransition(current, 'pending_confirmation', input);
  return {
    ...updated,
    ...(input.paymentReferenceHash !== undefined
      ? { paymentReferenceHash: input.paymentReferenceHash }
      : {}),
    ...(input.evidenceHash !== undefined ? { evidenceHash: input.evidenceHash } : {}),
  };
}

/**
 * Transition: pending_confirmation → completed.
 *
 * The receiver has confirmed the settlement. Sets `confirmedByMemberId`
 * and `confirmedAt` for the audit trail.
 */
export function confirmSettlement(
  current: Settlement,
  input: SettlementTransitionInput & {
    readonly confirmedByMemberId: MemberId;
  },
): Settlement {
  const now = input.now ?? nowDateTime();
  const updated = applyTransition(current, 'completed', input);
  return {
    ...updated,
    confirmedByMemberId: input.confirmedByMemberId,
    confirmedAt: asDateTime(now),
  };
}

/**
 * Transition: pending_confirmation → failed.
 *
 * The receiver rejected the settlement. The payer can retry by
 * transitioning `failed → draft` via `retrySettlementAsDraft`.
 */
export function rejectSettlement(
  current: Settlement,
  input: SettlementTransitionInput,
): Settlement {
  return applyTransition(current, 'failed', input);
}

/**
 * Transition: pending_confirmation → cancelled OR
 *             requested → cancelled.
 *
 * Either party cancels. Terminal state.
 */
export function cancelSettlement(
  current: Settlement,
  input: SettlementTransitionInput,
): Settlement {
  return applyTransition(current, 'cancelled', input);
}

/**
 * Transition: pending_confirmation → disputed.
 *
 * The receiver disputes the settlement. Requires a structured reason
 * from `ALL_DISPUTE_REASONS`; an optional free-text note is allowed.
 */
export function disputeSettlement(
  current: Settlement,
  input: SettlementTransitionInput & {
    readonly reason: SettlementDisputeReason;
    readonly note?: string;
  },
): Settlement {
  if (!ALL_DISPUTE_REASONS.includes(input.reason)) {
    throw new InvalidEntityError(
      `Invalid dispute reason: "${input.reason}"`,
    );
  }
  if (input.reason === 'other' && (!input.note || input.note.trim().length === 0)) {
    throw new InvalidEntityError(
      'Dispute reason "other" requires a note',
    );
  }
  const updated = applyTransition(current, 'disputed', input);
  return {
    ...updated,
    disputeReason: input.reason,
    ...(input.note !== undefined ? { disputeNote: input.note.trim() } : {}),
  };
}

/**
 * Transition: disputed → completed OR disputed → cancelled.
 *
 * Resolution of a dispute. If the dispute is resolved in favour of
 * the payment (receiver accepts after all), transition to `completed`;
 * otherwise transition to `cancelled`.
 */
export function resolveDispute(
  current: Settlement,
  input: SettlementTransitionInput & {
    readonly resolution: 'completed' | 'cancelled';
    readonly confirmedByMemberId?: MemberId;
  },
): Settlement {
  if (input.resolution === 'completed') {
    if (!input.confirmedByMemberId) {
      throw new InvalidEntityError(
        'resolveDispute to "completed" requires confirmedByMemberId',
      );
    }
    const now = input.now ?? nowDateTime();
    const updated = applyTransition(current, 'completed', input);
    return {
      ...updated,
      confirmedByMemberId: input.confirmedByMemberId,
      confirmedAt: asDateTime(now),
    };
  }
  return applyTransition(current, 'cancelled', input);
}

/**
 * Transition: completed → reversed.
 *
 * A completed settlement is being reversed. The caller MUST also
 * create a reversal settlement record via `createSettlementReversal`
 * to neutralise the financial impact — this transition only updates
 * the original's status and links it to the reversal record.
 */
export function reverseSettlement(
  current: Settlement,
  input: SettlementTransitionInput & {
    readonly reversalSettlementId: SettlementId;
  },
): Settlement {
  const updated = applyTransition(current, 'reversed', input);
  return {
    ...updated,
    reversesSettlementId: input.reversalSettlementId,
  };
}

/**
 * Transition: failed → draft.
 *
 * Retry a failed settlement as a fresh draft. The payer can then
 * request or record again.
 */
export function retrySettlementAsDraft(
  current: Settlement,
  input: SettlementTransitionInput,
): Settlement {
  return applyTransition(current, 'draft', input);
}

/**
 * Internal helper: apply a transition with optimistic-concurrency
 * check and version bump. Does NOT validate the transition itself —
 * the public transition functions call `assertValidTransition` via
 * this helper.
 */
function applyTransition(
  current: Settlement,
  to: SettlementStatus,
  input: SettlementTransitionInput,
): Settlement {
  if (current.deletedAt) {
    throw new DeletedEntityError(
      `Settlement ${current.id} is deleted; cannot transition to ${to}`,
      'Settlement',
      current.id,
    );
  }
  if (current.version !== input.expectedVersion) {
    throw new VersionConflictError(
      `Settlement version conflict: expected ${input.expectedVersion}, got ${current.version}`,
      input.expectedVersion as number,
      current.version as number,
    );
  }
  const from = current.status ?? 'completed';
  assertValidTransition(from, to);
  const now = input.now ?? nowDateTime();
  return {
    ...current,
    status: to,
    updatedAt: asDateTime(now),
    version: nextVersionNumber(current.version),
  };
}

/**
 * Input for creating a reversal settlement.
 *
 * A reversal is a NEW settlement record (separate financial record) that
 * cancels out an existing settlement by swapping `fromMemberId` and
 * `toMemberId` and using the same `amountMinor`. It does NOT mutate the
 * original settlement — financial history is preserved as an audit trail.
 */
export interface SettlementReversalInput {
  readonly id: SettlementId;
  readonly originalSettlement: Settlement;
  readonly createdBy: UserId;
  readonly now?: DateTime;
  readonly reason?: string;
}

/**
 * Create a reversal settlement that cancels out `originalSettlement`.
 *
 * The reversal:
 *   - Swaps `fromMemberId` and `toMemberId` (so the original payee pays back
 *     the original payer).
 *   - Uses the same `amountMinor` and `currencyCode` as the original.
 *   - Has its own new `id` and a fresh `version` of 1.
 *   - Sets `reversalOfSettlementId` pointing back to the original.
 *   - Status defaults to `'completed'` (a reversal is immediately
 *     effective in the balance engine — it cancels the original).
 *
 * The caller is responsible for separately updating the original settlement
 * to set its `reversesSettlementId` field (via `reverseSettlement`).
 */
export function createSettlementReversal(input: SettlementReversalInput): Settlement {
  const original = input.originalSettlement;
  const now = input.now ?? nowDateTime();
  // Reversal swaps from/to and uses the same amount
  return {
    id: input.id,
    groupId: original.groupId,
    fromMemberId: original.toMemberId,   // swapped
    toMemberId: original.fromMemberId,   // swapped
    amountMinor: original.amountMinor,
    currencyCode: original.currencyCode,
    method: original.method,
    settlementDate: asDateTime(now),
    ...(input.reason !== undefined ? { note: `Reversal: ${input.reason}` } : {}),
    createdBy: input.createdBy,
    createdAt: asDateTime(now),
    updatedAt: asDateTime(now),
    version: initialVersionNumber(),
    reversalOfSettlementId: original.id,
    // A reversal is immediately effective — it cancels the original.
    status: 'completed',
  };
}
