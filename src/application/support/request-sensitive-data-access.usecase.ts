/**
 * Use case: Request sensitive data access for a support ticket.
 *
 * CRITICAL: This use case is the single entry point for admins to
 * access raw receipt images, UPI IDs, payment references, bank account
 * numbers, or full backups. It enforces:
 *
 *   1. The data-access guard (`evaluateDataAccess`) — checks user
 *      consent + data-type sensitivity.
 *   2. Audit-trail creation (`createAuditEntry`) — every approved
 *      access is logged with admin ID, IP address, reason, consent
 *      state, and session duration.
 *
 * The use case NEVER returns the raw sensitive data itself. It returns
 * a `DataAccessDecision` + the audit entry ID. The admin then queries
 * the data through a separate, narrow read path that ALSO consults
 * the audit entry (defence-in-depth).
 *
 * Privacy contract:
 *   - If `userConsentGiven` is false for an ALWAYS_SENSITIVE_TYPE,
 *     access is DENIED and no audit entry is created (no access
 *     happened).
 *   - If access is DENIED for any other reason, no audit entry is
 *     created.
 *   - If access is ALLOWED, an audit entry is ALWAYS created with
 *     `requiresAuditTrail === true`.
 *
 * See `docs/customer-support-operations.md` and `docs/privacy-and-trust.md`.
 */

import {
  createAuditEntry,
  evaluateDataAccess,
  isSensitiveDataType,
  type DataAccessAuditEntry,
  type DataAccessDecision,
  type DataAccessRequest,
  type SensitiveDataType,
} from '@domain/support';

import type { DataAccessAuditRepository } from './support-repository.port';

// ---------------------------------------------------------------------------
// Inputs / outputs
// ---------------------------------------------------------------------------

export interface RequestSensitiveDataAccessInput {
  readonly request: DataAccessRequest;
  /** ISO date-time when the user gave consent (must be present when consent was required). */
  readonly userConsentDate: string;
  /** Admin's IP address. */
  readonly ipAddress: string;
  /** How long the admin's viewing session lasted, in milliseconds. */
  readonly sessionDurationMs: number;
  /** Stable ID for the audit entry (UUID). */
  readonly auditEntryId: string;
  /** ISO date-time "now" — defaults to the current time. */
  readonly accessedAt?: string;
}

export interface RequestSensitiveDataAccessOutput {
  readonly decision: DataAccessDecision;
  readonly auditEntry: DataAccessAuditEntry | null;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class RequestSensitiveDataAccessUseCase {
  constructor(private readonly auditRepo: DataAccessAuditRepository) {}

  async execute(
    input: RequestSensitiveDataAccessInput,
  ): Promise<RequestSensitiveDataAccessOutput> {
    // 1. Validate the request shape.
    if (!input || typeof input !== 'object') {
      throw new Error('input must be a RequestSensitiveDataAccessInput object');
    }
    if (!isSensitiveDataType(input.request.dataType)) {
      throw new Error(`Unknown sensitive data type: ${input.request.dataType}`);
    }
    if (typeof input.ipAddress !== 'string' || input.ipAddress.trim().length === 0) {
      throw new Error('ipAddress must be a non-empty string');
    }
    if (
      !Number.isFinite(input.sessionDurationMs) ||
      input.sessionDurationMs < 0
    ) {
      throw new Error(
        `sessionDurationMs must be a non-negative finite number, got ${input.sessionDurationMs}`,
      );
    }
    if (input.auditEntryId.trim().length === 0) {
      throw new Error('auditEntryId must not be empty');
    }

    // 2. Evaluate the access request via the data-access guard.
    const decision = evaluateDataAccess(input.request);

    // 3. If access was denied, do NOT create an audit entry (no access
    //    happened). Return the decision alone.
    if (!decision.allowed) {
      return { decision, auditEntry: null };
    }

    // 4. If access was allowed but no audit trail is required (defensive
    //    — this should not happen given the guard's current rules),
    //    return without an audit entry.
    if (!decision.requiresAuditTrail) {
      return { decision, auditEntry: null };
    }

    // 5. Create the audit entry.
    const auditEntry = createAuditEntry({
      id: input.auditEntryId,
      request: input.request,
      decision,
      userConsentDate: input.userConsentDate,
      ipAddress: input.ipAddress,
      sessionDurationMs: input.sessionDurationMs,
      ...(input.accessedAt !== undefined ? { accessedAt: input.accessedAt } : {}),
    });

    // 6. Persist the audit entry (append-only).
    await this.auditRepo.append(auditEntry);

    return { decision, auditEntry };
  }
}

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------

export type { DataAccessDecision, DataAccessRequest, SensitiveDataType };
