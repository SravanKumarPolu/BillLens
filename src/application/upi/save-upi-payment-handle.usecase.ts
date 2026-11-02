
import {
  asPaymentHandleId,
  createMemberPaymentHandle,
  type MemberPaymentHandle,
  type PaymentHandleType,
  type PaymentHandleVerificationStatus,
} from '@domain/entities/member-payment-handle';
import { InvalidEntityError } from '@domain/errors';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { MemberPaymentHandleRepository } from '@domain/repositories/payment-handle.repository';
import {
  isValidUpiVpa,
  maskUpiVpa,
  validateUpiVpa,
} from '@domain/services/upi/upi-vpa-validator';
import type { MemberId, PaymentHandleId, UserId } from '@shared-types/index';

/**
 * Use case: Save a member's UPI VPA payment handle.
 *
 * Phase 6 Track 4 — wraps the MemberPaymentHandle entity and the VPA
 * validator. Validates the VPA, masks it, creates the entity, and
 * saves it. Optionally marks it as the default for the member's
 * `upi_vpa` handles.
 *
 * ── Privacy contract ──
 *
 * The full VPA is passed in by the caller (the UI form). The use
 * case:
 *   1. Validates the VPA format (`validateUpiVpa`).
 *   2. Masks it for display (`maskUpiVpa`) — stored in
 *      `maskedDisplayValue`.
 *   3. Asks the `PaymentHandleEncryptionPort` (injected via the
 *      constructor) to encrypt the full VPA — stored in
 *      `encryptedValue`.
 *   4. Saves the handle via the repository.
 *   5. If `markAsDefault` is true, calls `markDefault` on the
 *      repository (which atomically clears other defaults of the
 *      same (member, type) and sets this one).
 *
 * The use case does NOT log the full VPA. The audit log entry
 * contains only the masked form and the handle id.
 */
export class SaveUpiPaymentHandleUseCase {
  constructor(
    private readonly handles: MemberPaymentHandleRepository,
    private readonly audit: AuditRepository,
    private readonly encryption: PaymentHandleEncryptionPort,
  ) {}

  async execute(input: SaveUpiPaymentHandleInput): Promise<SaveUpiPaymentHandleOutput> {
    // ── Validate the VPA ──
    if (!isValidUpiVpa(input.upiVpa)) {
      // Use validateUpiVpa to get a detailed error message.
      let reason = 'Invalid VPA format';
      try {
        validateUpiVpa(input.upiVpa);
      } catch (e) {
        reason = (e as Error).message;
      }
      throw new InvalidEntityError(`SaveUpiPaymentHandle: ${reason}`);
    }

    const maskedVpa = maskUpiVpa(input.upiVpa);

    // ── Encrypt the full VPA ──
    const encrypted = await this.encryption.encrypt(input.upiVpa);

    // ── Create the entity ──
    const id = asPaymentHandleId(generateId());
    const handle = createMemberPaymentHandle({
      id,
      memberId: input.memberId as never,
      type: 'upi_vpa',
      maskedDisplayValue: maskedVpa,
      encryptedValue: encrypted.ciphertext,
      encryptionKeyId: encrypted.keyId,
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.verificationStatus !== undefined
        ? { verificationStatus: input.verificationStatus }
        : {}),
      ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
    });

    // ── Save ──
    await this.handles.save(handle);

    // ── Mark as default if requested ──
    // The repository's markDefault method clears other defaults of
    // the same (member, type) atomically.
    let saved: MemberPaymentHandle = handle;
    if (input.isDefault === true) {
      saved = await this.handles.markDefault(id, handle.version as number);
    }

    // ── Audit ──
    // The audit entry contains only the masked VPA and the handle id —
    // never the full VPA.
    await this.audit.append({
      id: generateId(),
      entityType: 'payment_handle',
      entityId: id as string,
      action: 'create',
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      newVersion: saved.version as number,
      changeSummary: {
        type: 'upi_vpa',
        maskedVpa,
        isDefault: saved.isDefault,
        verificationStatus: saved.verificationStatus,
      },
    });

    return {
      handleId: id,
      maskedVpa,
      isDefault: saved.isDefault,
    };
  }
}

export interface SaveUpiPaymentHandleInput {
  readonly memberId: MemberId;
  /** The full UPI VPA, e.g. "john.doe@oksbi". */
  readonly upiVpa: string;
  /** Optional user-supplied label, e.g. "Personal UPI". */
  readonly label?: string;
  /** Mark this handle as the default for the member's upi_vpa handles. */
  readonly isDefault?: boolean;
  /** Initial verification status (defaults to 'unverified'). */
  readonly verificationStatus?: PaymentHandleVerificationStatus;
  readonly actorId?: UserId;
}

export interface SaveUpiPaymentHandleOutput {
  readonly handleId: PaymentHandleId;
  /** The masked form, safe to show in UI. */
  readonly maskedVpa: string;
  readonly isDefault: boolean;
}

// ---------------------------------------------------------------------------
// Port: encryption
// ---------------------------------------------------------------------------

/**
 * Encryption port for payment handles.
 *
 * The concrete implementation uses envelope encryption with a
 * per-tenant key. The application layer never sees the plaintext key.
 *
 * The port has TWO methods:
 *   - `encrypt(plaintext)` → returns ciphertext + key id
 *   - `decrypt(ciphertext, keyId)` → returns plaintext
 *
 * The decrypt method is used by the UPI deep-link use case to
 * recover the full VPA at the moment the deep link is built. The
 * plaintext is held in memory only for the duration of the deep-link
 * build; it is never persisted in plaintext.
 */
export interface PaymentHandleEncryptionPort {
  encrypt(plaintext: string): Promise<{ readonly ciphertext: string; readonly keyId: string }>;
  decrypt(ciphertext: string, keyId: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Re-export the type so callers can import from one place
export type { PaymentHandleType };
