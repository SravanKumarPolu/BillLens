/**
 * Audit trail for sensitive data access.
 *
 * CRITICAL: Every time an admin accesses a user's receipt image, UPI
 * ID, payment reference, bank account, or full backup, an audit entry
 * MUST be created. The audit entry captures:
 *   - WHO: the admin ID + IP address.
 *   - WHAT: the data type accessed.
 *   - WHEN: the access timestamp.
 *   - WHY: the admin's stated reason.
 *   - CONSENT: whether the user gave explicit consent, and when.
 *   - DURATION: how long the admin's session viewing the data lasted.
 *
 * Audit entries are immutable + append-only. The audit trail is the
 * legal record of who-saw-what-when — it MUST NOT be modified or
 * deleted (except by a documented data-retention policy).
 *
 * See `docs/customer-support-operations.md` and `docs/privacy-and-trust.md`.
 */

import type { DataAccessDecision, DataAccessRequest, SensitiveDataType } from './data-access-guard';

// ---------------------------------------------------------------------------
// Audit entry
// ---------------------------------------------------------------------------

export interface DataAccessAuditEntry {
  /** Stable identifier (UUID). */
  readonly id: string;
  /** The ticket for which the access was requested. */
  readonly ticketId: string;
  /** The admin who requested access. */
  readonly adminId: string;
  /** The type of sensitive data accessed. */
  readonly dataType: SensitiveDataType;
  /** ISO date-time when the access occurred. */
  readonly accessedAt: string;
  /** The admin's stated reason for the access (no PII). */
  readonly reason: string;
  /** Whether the user gave explicit consent for this access. */
  readonly userConsentGiven: boolean;
  /** ISO date-time when the user gave consent. */
  readonly userConsentDate: string;
  /** The IP address from which the admin made the request. */
  readonly ipAddress: string;
  /** How long the admin's viewing session lasted, in milliseconds. */
  readonly sessionDurationMs: number;
}

export interface CreateAuditEntryInput {
  /** Stable identifier (UUID). */
  readonly id: string;
  /** The original access request. */
  readonly request: DataAccessRequest;
  /** The decision returned by the data access guard. */
  readonly decision: DataAccessDecision;
  /** ISO date-time when the user gave consent (must be present when consent was required). */
  readonly userConsentDate: string;
  /** The IP address from which the admin made the request. */
  readonly ipAddress: string;
  /** How long the admin's viewing session lasted, in milliseconds. */
  readonly sessionDurationMs: number;
  /** ISO date-time "now" — defaults to the current time when the use case runs. */
  readonly accessedAt?: string;
}

/**
 * Create an audit entry from an access request + decision.
 *
 * PRECONDITION: the decision MUST have `requiresAuditTrail === true`.
 * If the decision did not require an audit trail, this function throws
 * — there should be no audit entry for an access that was never
 * allowed or that does not require an audit trail.
 */
export function createAuditEntry(input: CreateAuditEntryInput): DataAccessAuditEntry {
  if (input.id.trim().length === 0) {
    throw new Error('Audit entry id must not be empty');
  }
  if (!input.decision.requiresAuditTrail) {
    throw new Error(
      'Cannot create an audit entry when the decision does not require an audit trail',
    );
  }
  if (!input.decision.allowed) {
    throw new Error(
      'Cannot create an audit entry when the decision denied access',
    );
  }
  if (input.decision.requiresUserConsent) {
    if (!input.request.userConsentGiven) {
      throw new Error(
        'Cannot create an audit entry when consent was required but not given',
      );
    }
    if (Number.isNaN(Date.parse(input.userConsentDate))) {
      throw new Error('userConsentDate must be a valid ISO date-time when consent was given');
    }
  }
  if (typeof input.ipAddress !== 'string' || input.ipAddress.trim().length === 0) {
    throw new Error('ipAddress must be a non-empty string');
  }
  if (!isValidIpAddress(input.ipAddress)) {
    throw new Error(`ipAddress is not a valid IPv4 or IPv6 address: ${input.ipAddress}`);
  }
  if (
    !Number.isFinite(input.sessionDurationMs) ||
    input.sessionDurationMs < 0
  ) {
    throw new Error(
      `sessionDurationMs must be a non-negative finite number, got ${input.sessionDurationMs}`,
    );
  }
  const accessedAt = input.accessedAt ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(accessedAt))) {
    throw new Error('accessedAt must be a valid ISO date-time');
  }

  return Object.freeze({
    id: input.id,
    ticketId: input.request.ticketId,
    adminId: input.request.adminId,
    dataType: input.request.dataType,
    accessedAt,
    reason: input.request.reason,
    userConsentGiven: input.request.userConsentGiven,
    userConsentDate: input.decision.requiresUserConsent
      ? input.userConsentDate
      : '',
    ipAddress: input.ipAddress,
    sessionDurationMs: input.sessionDurationMs,
  });
}

/**
 * Returns the access history for a ticket, sorted by `accessedAt`
 * descending (most recent first).
 */
export function getAccessHistory(
  entries: readonly DataAccessAuditEntry[],
  ticketId: string,
): readonly DataAccessAuditEntry[] {
  if (typeof ticketId !== 'string' || ticketId.trim().length === 0) {
    throw new Error('ticketId must be a non-empty string');
  }
  return Object.freeze(
    entries
      .filter((e) => e.ticketId === ticketId)
      .slice()
      .sort((a, b) => Date.parse(b.accessedAt) - Date.parse(a.accessedAt)),
  );
}

/**
 * Returns the access history for an admin, sorted by `accessedAt`
 * descending. Useful for admin-activity reports.
 */
export function getAdminAccessHistory(
  entries: readonly DataAccessAuditEntry[],
  adminId: string,
): readonly DataAccessAuditEntry[] {
  if (typeof adminId !== 'string' || adminId.trim().length === 0) {
    throw new Error('adminId must be a non-empty string');
  }
  return Object.freeze(
    entries
      .filter((e) => e.adminId === adminId)
      .slice()
      .sort((a, b) => Date.parse(b.accessedAt) - Date.parse(a.accessedAt)),
  );
}

/**
 * Returns the count of accesses per data type. Useful for compliance
 * dashboards.
 */
export function accessCountByDataType(
  entries: readonly DataAccessAuditEntry[],
): Readonly<Record<SensitiveDataType, number>> {
  const out: Record<SensitiveDataType, number> = {
    receipt_image: 0,
    upi_id: 0,
    payment_reference: 0,
    bank_account: 0,
    ocr_text: 0,
    full_backup: 0,
  };
  for (const e of entries) {
    out[e.dataType] += 1;
  }
  return Object.freeze(out);
}

// ---------------------------------------------------------------------------
// IP address validation (lightweight — not a full CIDR parser)
// ---------------------------------------------------------------------------

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_RE = /^[0-9a-fA-F:]+$/;

function isValidIpAddress(ip: string): boolean {
  // IPv4 with each octet in [0, 255].
  const v4 = IPV4_RE.exec(ip);
  if (v4 !== null) {
    for (let i = 1; i <= 4; i++) {
      const octet = Number(v4[i]);
      if (!Number.isInteger(octet) || octet < 0 || octet > 255) return false;
    }
    return true;
  }
  // IPv6 (very loose — just allow hex + colons).
  if (IPV6_RE.test(ip) && ip.includes(':')) {
    return true;
  }
  return false;
}
