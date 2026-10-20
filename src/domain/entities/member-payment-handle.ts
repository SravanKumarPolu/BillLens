import type {
  MemberId,
  PaymentHandleId,
} from '@shared-types/index';

import { DeletedEntityError, InvalidEntityError, VersionConflictError } from '../errors/index';
import {
  type DateTime,
  type VersionNumber,
  asDateTime,
  initialVersionNumber,
  nextVersionNumber,
  nowDateTime,
} from '../value-objects/index';

// ---------------------------------------------------------------------------
// ID helpers
// ---------------------------------------------------------------------------

export function asPaymentHandleId(value: string): PaymentHandleId {
  return value as PaymentHandleId;
}

// ---------------------------------------------------------------------------
// Type — payment handle type (UPI VPA, bank account, wallet)
// ---------------------------------------------------------------------------

/**
 * The kind of payment handle. Phase 6 Track 4 ships `upi_vpa` only —
 * the `bank_account` and `wallet` types are reserved for future use
 * (Track 4 deliberately scopes UPI to VPA-only to keep the surface
 * small).
 *
 * The string values are stored in the `member_payment_handles.type`
 * column (CHECK constraint, see the Phase 6 Track 1 migration).
 */
export type PaymentHandleType = 'upi_vpa' | 'bank_account' | 'wallet';

export const ALL_PAYMENT_HANDLE_TYPES: readonly PaymentHandleType[] = [
  'upi_vpa',
  'bank_account',
  'wallet',
];

// ---------------------------------------------------------------------------
// Verification status — three-state per the spec
// ---------------------------------------------------------------------------

/**
 * Verification status for a payment handle, per Phase 6 Prompt 56:
 *
 *   - `unverified` — the user entered the handle but it has not been
 *     verified by any means. This is the default for newly-created
 *     handles.
 *   - `user_confirmed` — the user has explicitly confirmed the
 *     handle is correct (e.g. typed it twice, confirmed by entering
 *     a tiny test amount). NOT a third-party verification.
 *   - `verified` — verified by a third-party mechanism (tiny test
 *     transaction, UPI mandate, etc.). Reserved for a future
 *     verification integration; BillLens does not perform this in
 *     the MVP.
 *
 * The UPI deep-link builder accepts handles in any verification
 * status — verification is a user trust signal, not a gate. The
 * UI MAY show a "not verified" badge next to unverified handles,
 * but it does not prevent launching UPI.
 */
export type PaymentHandleVerificationStatus =
  | 'unverified'
  | 'user_confirmed'
  | 'verified';

export const ALL_VERIFICATION_STATUSES: readonly PaymentHandleVerificationStatus[] = [
  'unverified',
  'user_confirmed',
  'verified',
];

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/**
 * A payment handle is a member's address for receiving payments via
 * a specific channel (UPI VPA, bank account, wallet). Phase 6
 * Track 4 ships the `upi_vpa` type — the others are reserved.
 *
 * ── Privacy contract (spec rule) ──
 *
 * "Do not expose the full UPI ID in logs, analytics or public group
 *  previews."
 *
 * The entity stores the handle in TWO forms:
 *
 *   - `maskedDisplayValue` — the user-facing form (e.g.
 *     "ja***@oksbi"). Safe to show in UI and to include in audit
 *     logs. ALWAYS present.
 *   - `encryptedValue` — the ciphertext of the full handle, plus
 *     `encryptionKeyId` identifying which key was used. NULLABLE
 *     only when the handle was entered but not yet persisted (the
 *     transient case). The application layer NEVER sees the
 *     plaintext key — envelope encryption with a per-tenant key.
 *
 * The full VPA is NEVER stored in plaintext on the entity. The
 * `buildUpiDeepLink` function takes the full VPA as a parameter at
 * call time (the caller resolves it from the encrypted store), not
 * from the entity.
 *
 * ── Identity ──
 *
 * A member may have multiple handles of the same type (e.g. one
 * personal UPI VPA and one joint-account VPA). At most ONE may be
 * marked `isDefault = true` per (member, type) — enforced by a
 * partial unique index in the schema (Track 1 migration).
 */
export interface MemberPaymentHandle {
  readonly id: PaymentHandleId;
  readonly memberId: MemberId;
  readonly type: PaymentHandleType;

  /** User-facing masked form, e.g. "ja***@oksbi". Always present. */
  readonly maskedDisplayValue: string;

  /** Ciphertext of the full handle. Nullable for transient handles. */
  readonly encryptedValue?: string;

  /** Id of the key used to encrypt `encryptedValue`. For key rotation. */
  readonly encryptionKeyId?: string;

  readonly verificationStatus: PaymentHandleVerificationStatus;

  /** At most one default per (member, type). Enforced by partial unique index. */
  readonly isDefault: boolean;

  /** Optional user-supplied label, e.g. "Personal UPI", "Joint A/C". */
  readonly label?: string;

  readonly createdAt: DateTime;
  readonly updatedAt: DateTime;
  readonly deletedAt?: DateTime;
  readonly version: VersionNumber;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface MemberPaymentHandleCreateInput {
  readonly id: PaymentHandleId;
  readonly memberId: MemberId;
  readonly type: PaymentHandleType;
  /** Masked form. Required. */
  readonly maskedDisplayValue: string;
  /** Ciphertext. Optional (transient handle has none yet). */
  readonly encryptedValue?: string;
  readonly encryptionKeyId?: string;
  readonly verificationStatus?: PaymentHandleVerificationStatus;
  readonly isDefault?: boolean;
  readonly label?: string;
  readonly now?: DateTime;
}

/**
 * Create a new `MemberPaymentHandle`.
 *
 * Throws `InvalidEntityError` if:
 *   - the masked value is empty or shorter than 3 chars
 *   - the masked value is longer than 64 chars
 *   - `encryptedValue` is the empty string (must be either a
 *     non-empty ciphertext or undefined)
 *   - `label` is longer than 64 chars
 *   - `verificationStatus` is not one of the three valid values
 *
 * The factory does NOT validate the underlying VPA format — that
 * is done by the VPA validator (`validateUpiVpa` in
 * `upi-vpa-validator.ts`) at the point where the user enters the
 * handle. The factory trusts the caller to have already validated.
 * The separation keeps the entity creation pure and testable
 * without coupling to the VPA format.
 */
export function createMemberPaymentHandle(
  input: MemberPaymentHandleCreateInput,
): MemberPaymentHandle {
  if (!input.maskedDisplayValue || input.maskedDisplayValue.trim().length < 3) {
    throw new InvalidEntityError(
      'PaymentHandle.maskedDisplayValue must be at least 3 characters',
    );
  }
  if (input.maskedDisplayValue.length > 64) {
    throw new InvalidEntityError(
      'PaymentHandle.maskedDisplayValue must be at most 64 characters',
    );
  }
  if (input.encryptedValue !== undefined && input.encryptedValue.length === 0) {
    throw new InvalidEntityError(
      'PaymentHandle.encryptedValue must be either a non-empty ciphertext or undefined',
    );
  }
  if (input.label !== undefined && input.label.length > 64) {
    throw new InvalidEntityError(
      'PaymentHandle.label must be at most 64 characters',
    );
  }
  if (
    input.verificationStatus !== undefined &&
    !ALL_VERIFICATION_STATUSES.includes(input.verificationStatus)
  ) {
    throw new InvalidEntityError(
      `PaymentHandle.verificationStatus is not a valid value: "${input.verificationStatus}"`,
    );
  }
  if (!ALL_PAYMENT_HANDLE_TYPES.includes(input.type)) {
    throw new InvalidEntityError(
      `PaymentHandle.type is not a valid value: "${input.type}"`,
    );
  }

  const now = input.now ?? nowDateTime();
  return {
    id: input.id,
    memberId: input.memberId,
    type: input.type,
    maskedDisplayValue: input.maskedDisplayValue,
    ...(input.encryptedValue !== undefined
      ? { encryptedValue: input.encryptedValue }
      : {}),
    ...(input.encryptionKeyId !== undefined
      ? { encryptionKeyId: input.encryptionKeyId }
      : {}),
    verificationStatus: input.verificationStatus ?? 'unverified',
    isDefault: input.isDefault ?? false,
    ...(input.label !== undefined ? { label: input.label } : {}),
    createdAt: asDateTime(now),
    updatedAt: asDateTime(now),
    version: initialVersionNumber(),
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface PaymentHandleMarkDefaultInput {
  readonly expectedVersion: VersionNumber;
  readonly now?: DateTime;
}

/**
 * Mark a payment handle as the default for its (member, type) pair.
 *
 * The caller is responsible for clearing `isDefault` on any other
 * handle of the same (member, type) — this function does NOT do
 * that automatically. The repository's `markDefault` method (which
 * wraps this entity function) handles the cross-handle update in
 * a single transaction.
 *
 * Throws `VersionConflictError` on stale version.
 */
export function markPaymentHandleDefault(
  current: MemberPaymentHandle,
  input: PaymentHandleMarkDefaultInput,
): MemberPaymentHandle {
  if (current.version !== input.expectedVersion) {
    throw new VersionConflictError(
      `PaymentHandle version conflict: expected ${input.expectedVersion}, got ${current.version}`,
      input.expectedVersion as number,
      current.version as number,
    );
  }
  if (current.deletedAt !== undefined) {
    throw new DeletedEntityError(
      `PaymentHandle ${current.id} is deleted; cannot mark as default`,
      'PaymentHandle',
      current.id,
    );
  }
  const now = input.now ?? nowDateTime();
  return {
    ...current,
    isDefault: true,
    updatedAt: asDateTime(now),
    version: nextVersionNumber(current.version),
  };
}

export interface PaymentHandleVerifyInput {
  readonly expectedVersion: VersionNumber;
  readonly newStatus: PaymentHandleVerificationStatus;
  readonly now?: DateTime;
}

/**
 * Update the verification status of a payment handle.
 *
 * Used when the user confirms a handle (transition
 * `unverified → user_confirmed`) or when a future verification
 * integration completes (transition `* → verified`).
 *
 * Throws `VersionConflictError` on stale version.
 * Throws `InvalidEntityError` if the new status is invalid.
 */
export function verifyPaymentHandle(
  current: MemberPaymentHandle,
  input: PaymentHandleVerifyInput,
): MemberPaymentHandle {
  if (current.version !== input.expectedVersion) {
    throw new VersionConflictError(
      `PaymentHandle version conflict: expected ${input.expectedVersion}, got ${current.version}`,
      input.expectedVersion as number,
      current.version as number,
    );
  }
  if (current.deletedAt !== undefined) {
    throw new DeletedEntityError(
      `PaymentHandle ${current.id} is deleted; cannot verify`,
      'PaymentHandle',
      current.id,
    );
  }
  if (!ALL_VERIFICATION_STATUSES.includes(input.newStatus)) {
    throw new InvalidEntityError(
      `PaymentHandle.verificationStatus is not a valid value: "${input.newStatus}"`,
    );
  }
  const now = input.now ?? nowDateTime();
  return {
    ...current,
    verificationStatus: input.newStatus,
    updatedAt: asDateTime(now),
    version: nextVersionNumber(current.version),
  };
}

export interface PaymentHandleSoftDeleteInput {
  readonly expectedVersion: VersionNumber;
  readonly now?: DateTime;
}

/**
 * Soft-delete a payment handle. The handle remains in the database
 * for audit but `deletedAt` is set; no further mutations are allowed.
 */
export function softDeletePaymentHandle(
  current: MemberPaymentHandle,
  input: PaymentHandleSoftDeleteInput,
): MemberPaymentHandle {
  if (current.version !== input.expectedVersion) {
    throw new VersionConflictError(
      `PaymentHandle version conflict: expected ${input.expectedVersion}, got ${current.version}`,
      input.expectedVersion as number,
      current.version as number,
    );
  }
  if (current.deletedAt !== undefined) {
    throw new DeletedEntityError(
      `PaymentHandle ${current.id} is already deleted`,
      'PaymentHandle',
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

/**
 * Predicate: is the handle active (not soft-deleted)?
 */
export function isPaymentHandleActive(h: MemberPaymentHandle): boolean {
  return h.deletedAt === undefined;
}
