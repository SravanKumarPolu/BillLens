/**
 * Repository port for support ticket persistence.
 *
 * Implementations MUST only persist already-PII-redacted ticket
 * bodies. The use case redacts BEFORE calling the port.
 */

import type { DataAccessAuditEntry, SupportTicket } from '@domain/support';

export interface SupportTicketRepository {
  /** Persist a support ticket. Idempotent by `id`. */
  save(ticket: SupportTicket): Promise<void>;

  /** Fetch a support ticket by id. Returns null if not found. */
  findById(id: string): Promise<SupportTicket | null>;

  /** Fetch a support ticket by its ticket number. Returns null if not found. */
  findByTicketNumber(ticketNumber: string): Promise<SupportTicket | null>;

  /** List tickets for a requester (user), most-recent-first. */
  listByRequester(requesterId: string, limit: number): Promise<readonly SupportTicket[]>;

  /** List tickets assigned to an admin, most-recent-first. */
  listByAssignee(adminId: string, limit: number): Promise<readonly SupportTicket[]>;

  /** List tickets by status, most-recent-first. */
  listByStatus(status: SupportTicket['status'], limit: number): Promise<readonly SupportTicket[]>;
}

/**
 * Port for accessing the ticket sequence (used to generate ticket
 * numbers like "BL-1234"). Implementations MUST guarantee
 * monotonically increasing numbers across concurrent calls.
 */
export interface TicketSequencePort {
  nextTicketNumber(): Promise<string>;
}

/**
 * Port for persisting audit trail entries. Audit entries are
 * append-only — implementations MUST NOT support update / delete.
 */
export interface DataAccessAuditRepository {
  append(entry: DataAccessAuditEntry): Promise<void>;
  listByTicket(ticketId: string): Promise<readonly DataAccessAuditEntry[]>;
  listByAdmin(adminId: string): Promise<readonly DataAccessAuditEntry[]>;
}
