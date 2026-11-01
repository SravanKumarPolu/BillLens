import type { MemberId, PaymentHandleId } from '@shared-types/index';

import type { MemberPaymentHandle } from '../entities/member-payment-handle';
import type { DateTime } from '../value-objects/date-time';

import type {
  DeleteMetadata,
  PaginatedResult,
  Pagination,
  SoftDeleteResult,
} from './repository-contracts';

/**
 * Repository for the `MemberPaymentHandle` entity — Phase 6 Track 4.
 *
 * Stores member UPI VPA / bank handles for the UPI-assisted settlement
 * flow. Each handle is stored MASKED + ENCRYPTED — the full VPA
 * never appears in logs, analytics, or public group previews.
 *
 * ── Privacy contract (spec rule, Prompt 56) ──
 *
 *   "Do not expose the full UPI ID in logs, analytics or public
 *    group previews."
 *
 * The repository returns the entity with both `maskedDisplayValue`
 * (safe to show) and `encryptedValue` (ciphertext). The application
 * layer NEVER sees the plaintext VPA — it is decrypted only at the
 * moment the UPI deep-link is built, by a port that has access to
 * the encryption key.
 *
 * ── At most one default per (member, type) ──
 *
 * The schema enforces this via a partial unique index. The
 * repository's `markDefault` method handles the cross-handle update
 * in a single transaction: it sets `isDefault = false` on every
 * other handle of the same (member, type), then sets
 * `isDefault = true` on the target handle. The application layer
 * does NOT need to do this manually.
 */
export interface MemberPaymentHandleRepository {
  /** Find a payment handle by id. Returns null if not found or soft-deleted. */
  findById(id: PaymentHandleId): Promise<MemberPaymentHandle | null>;

  /**
   * List all active (non-deleted) payment handles for a member.
   * Optionally filtered by type.
   */
  listByMember(
    memberId: MemberId,
    filter?: { readonly type?: MemberPaymentHandle['type'] },
    pagination?: Pagination,
  ): Promise<PaginatedResult<MemberPaymentHandle>>;

  /**
   * Find the default handle for a (member, type) pair. Returns null
   * if the member has no handle of that type, or if no default is set.
   */
  findDefault(
    memberId: MemberId,
    type: MemberPaymentHandle['type'],
  ): Promise<MemberPaymentHandle | null>;

  /** Save a new or updated payment handle. */
  save(handle: MemberPaymentHandle): Promise<void>;

  /**
   * Mark a handle as the default for its (member, type) pair. The
   * repository clears `isDefault` on every other handle of the same
   * (member, type) atomically in a single transaction.
   *
   * Returns the updated handle (with `isDefault = true` and a bumped
   * version).
   */
  markDefault(id: PaymentHandleId, expectedVersion: number): Promise<MemberPaymentHandle>;

  /** Soft-delete a handle. The handle remains in the database for audit. */
  softDelete(id: PaymentHandleId, metadata: DeleteMetadata): Promise<SoftDeleteResult>;

  /**
   * Update the verification status of a handle. Used when the user
   * confirms a handle (`unverified → user_confirmed`) or when a
   * future verification integration completes (`* → verified`).
   */
  updateVerificationStatus(
    id: PaymentHandleId,
    expectedVersion: number,
    newStatus: MemberPaymentHandle['verificationStatus'],
    now?: DateTime,
  ): Promise<MemberPaymentHandle>;
}
