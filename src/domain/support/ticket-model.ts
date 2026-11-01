/**
 * Support ticket domain model.
 *
 * Tickets are the central coordination object for customer support
 * operations. They carry:
 *   - 7 statuses (new → open → in_progress → waiting_customer →
 *     waiting_engineering → resolved → closed)
 *   - 4 priorities (urgent, high, normal, low)
 *   - 4 channels (in_app, email, web_form, api)
 *
 * CRITICAL: tickets NEVER contain raw receipt images, UPI IDs, payment
 * references, or bank account numbers in their free-text fields. The
 * ticket body is PII-redacted by the manage-ticket use case before
 * storage. Access to sensitive underlying data is gated by the
 * `data-access-guard` module + `audit-trail` module.
 *
 * See `docs/customer-support-operations.md`.
 */

// ---------------------------------------------------------------------------
// Statuses (7)
// ---------------------------------------------------------------------------

export type TicketStatus =
  | 'new'
  | 'open'
  | 'in_progress'
  | 'waiting_customer'
  | 'waiting_engineering'
  | 'resolved'
  | 'closed';

export const TICKET_STATUSES: readonly TicketStatus[] = [
  'new',
  'open',
  'in_progress',
  'waiting_customer',
  'waiting_engineering',
  'resolved',
  'closed',
] as const;

export function isTicketStatus(value: unknown): value is TicketStatus {
  return (
    typeof value === 'string' &&
    (TICKET_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Allowed status transitions.
 *
 *   new → open | resolved | closed
 *   open → in_progress | waiting_customer | waiting_engineering | resolved | closed
 *   in_progress → waiting_customer | waiting_engineering | resolved | closed
 *   waiting_customer → open | in_progress | resolved | closed
 *   waiting_engineering → in_progress | resolved | closed
 *   resolved → closed
 *   closed → (terminal)
 */
export const TICKET_TRANSITIONS: Readonly<Record<TicketStatus, readonly TicketStatus[]>> = Object.freeze({
  new: ['open', 'resolved', 'closed'],
  open: ['in_progress', 'waiting_customer', 'waiting_engineering', 'resolved', 'closed'],
  in_progress: ['waiting_customer', 'waiting_engineering', 'resolved', 'closed'],
  waiting_customer: ['open', 'in_progress', 'resolved', 'closed'],
  waiting_engineering: ['in_progress', 'resolved', 'closed'],
  resolved: ['closed'],
  closed: [],
});

export function canTransitionTicket(from: TicketStatus, to: TicketStatus): boolean {
  const allowed = TICKET_TRANSITIONS[from];
  return allowed !== undefined && (allowed as readonly string[]).includes(to);
}

// ---------------------------------------------------------------------------
// Priorities (4)
// ---------------------------------------------------------------------------

export type TicketPriority = 'urgent' | 'high' | 'normal' | 'low';

export const TICKET_PRIORITIES: readonly TicketPriority[] = [
  'urgent',
  'high',
  'normal',
  'low',
] as const;

export function isTicketPriority(value: unknown): value is TicketPriority {
  return (
    typeof value === 'string' &&
    (TICKET_PRIORITIES as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Channels (4)
// ---------------------------------------------------------------------------

export type TicketChannel = 'in_app' | 'email' | 'web_form' | 'api';

export const TICKET_CHANNELS: readonly TicketChannel[] = [
  'in_app',
  'email',
  'web_form',
  'api',
] as const;

export function isTicketChannel(value: unknown): value is TicketChannel {
  return (
    typeof value === 'string' &&
    (TICKET_CHANNELS as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Ticket entity
// ---------------------------------------------------------------------------

export interface SupportTicket {
  /** Stable identifier (UUID). */
  readonly id: string;
  /** User-facing ticket number (e.g. "BL-1234"). */
  readonly ticketNumber: string;
  /** Subject line (PII-redacted, max 200 chars). */
  readonly subject: string;
  /** Body / description (PII-redacted, max 8000 chars). */
  readonly body: string;
  /** Current status. */
  readonly status: TicketStatus;
  /** Priority. */
  readonly priority: TicketPriority;
  /** Channel through which the ticket was created. */
  readonly channel: TicketChannel;
  /** ISO date-time the ticket was created. */
  readonly createdAt: string;
  /** ISO date-time the ticket was last updated. */
  readonly updatedAt: string;
  /** ISO date-time the ticket was resolved, or null. */
  readonly resolvedAt: string | null;
  /** ISO date-time the ticket was closed, or null. */
  readonly closedAt: string | null;
  /** Admin agent assigned to the ticket, or null. */
  readonly assigneeId: string | null;
  /** User who submitted the ticket (the requester). */
  readonly requesterId: string;
  /** Optional category (free-form, PII-redacted). */
  readonly category: string | null;
  /** Optional tags (PII-redacted). */
  readonly tags: readonly string[];
  /** CSAT score (1..5) submitted by the user, or null. */
  readonly csatScore: number | null;
  /** Schema version. */
  readonly version: number;
}

export interface SupportTicketInput {
  readonly id: string;
  readonly ticketNumber: string;
  readonly subject: string;
  readonly body: string;
  readonly status?: TicketStatus;
  readonly priority: TicketPriority;
  readonly channel: TicketChannel;
  readonly createdAt: string;
  readonly updatedAt?: string;
  readonly resolvedAt?: string | null;
  readonly closedAt?: string | null;
  readonly assigneeId?: string | null;
  readonly requesterId: string;
  readonly category?: string | null;
  readonly tags?: readonly string[];
  readonly csatScore?: number | null;
  readonly version?: number;
}

export const TICKET_SUBJECT_MAX_LENGTH = 200;
export const TICKET_BODY_MAX_LENGTH = 8000;
export const DEFAULT_TICKET_VERSION = 1;

export function createTicket(input: SupportTicketInput): SupportTicket {
  if (input.id.trim().length === 0) throw new Error('Ticket id must not be empty');
  if (input.ticketNumber.trim().length === 0) {
    throw new Error('Ticket ticketNumber must not be empty');
  }
  if (input.subject.trim().length === 0) {
    throw new Error('Ticket subject must not be empty');
  }
  if (input.subject.length > TICKET_SUBJECT_MAX_LENGTH) {
    throw new Error(
      `Ticket subject too long: ${input.subject.length} > ${TICKET_SUBJECT_MAX_LENGTH}`,
    );
  }
  if (input.body.length > TICKET_BODY_MAX_LENGTH) {
    throw new Error(
      `Ticket body too long: ${input.body.length} > ${TICKET_BODY_MAX_LENGTH}`,
    );
  }
  if (!isTicketStatus(input.status ?? 'new')) {
    throw new Error(`Unknown ticket status: ${input.status ?? 'new'}`);
  }
  if (!isTicketPriority(input.priority)) {
    throw new Error(`Unknown ticket priority: ${input.priority}`);
  }
  if (!isTicketChannel(input.channel)) {
    throw new Error(`Unknown ticket channel: ${input.channel}`);
  }
  if (Number.isNaN(Date.parse(input.createdAt))) {
    throw new Error('createdAt must be a valid ISO date-time');
  }
  const updatedAt = input.updatedAt ?? input.createdAt;
  if (Number.isNaN(Date.parse(updatedAt))) {
    throw new Error('updatedAt must be a valid ISO date-time');
  }
  if (input.requesterId.trim().length === 0) {
    throw new Error('Ticket requesterId must not be empty');
  }
  if (input.csatScore !== undefined && input.csatScore !== null) {
    if (
      !Number.isInteger(input.csatScore) ||
      input.csatScore < 1 ||
      input.csatScore > 5
    ) {
      throw new Error(`csatScore must be an integer in [1, 5], got ${input.csatScore}`);
    }
  }
  return Object.freeze({
    id: input.id,
    ticketNumber: input.ticketNumber,
    subject: input.subject,
    body: input.body,
    status: input.status ?? 'new',
    priority: input.priority,
    channel: input.channel,
    createdAt: input.createdAt,
    updatedAt,
    resolvedAt: input.resolvedAt ?? null,
    closedAt: input.closedAt ?? null,
    assigneeId: input.assigneeId ?? null,
    requesterId: input.requesterId,
    category: input.category ?? null,
    tags: Object.freeze([...(input.tags ?? [])]),
    csatScore: input.csatScore ?? null,
    version: input.version ?? DEFAULT_TICKET_VERSION,
  });
}

/**
 * Transition a ticket to a new status. Returns a NEW ticket object.
 * When transitioning to `resolved`, sets `resolvedAt` to the supplied
 * timestamp. When transitioning to `closed`, sets `closedAt`.
 */
export function transitionTicket(
  ticket: SupportTicket,
  to: TicketStatus,
  nowIso: string,
): SupportTicket {
  if (!canTransitionTicket(ticket.status, to)) {
    throw new Error(`Illegal ticket transition: ${ticket.status} → ${to}`);
  }
  if (Number.isNaN(Date.parse(nowIso))) {
    throw new Error('nowIso must be a valid ISO date-time');
  }
  return Object.freeze({
    ...ticket,
    status: to,
    updatedAt: nowIso,
    resolvedAt: to === 'resolved' ? nowIso : ticket.resolvedAt,
    closedAt: to === 'closed' ? nowIso : ticket.closedAt,
    version: ticket.version + 1,
  });
}

/**
 * Assign the ticket to an admin agent.
 */
export function assignTicket(
  ticket: SupportTicket,
  assigneeId: string,
  nowIso: string,
): SupportTicket {
  if (assigneeId.trim().length === 0) {
    throw new Error('assigneeId must not be empty');
  }
  if (Number.isNaN(Date.parse(nowIso))) {
    throw new Error('nowIso must be a valid ISO date-time');
  }
  return Object.freeze({
    ...ticket,
    assigneeId,
    updatedAt: nowIso,
    version: ticket.version + 1,
  });
}

/**
 * Record a CSAT score (1..5) on a resolved ticket.
 */
export function recordCsat(
  ticket: SupportTicket,
  csatScore: number,
  nowIso: string,
): SupportTicket {
  if (!Number.isInteger(csatScore) || csatScore < 1 || csatScore > 5) {
    throw new Error(`csatScore must be an integer in [1, 5], got ${csatScore}`);
  }
  if (Number.isNaN(Date.parse(nowIso))) {
    throw new Error('nowIso must be a valid ISO date-time');
  }
  return Object.freeze({
    ...ticket,
    csatScore,
    updatedAt: nowIso,
    version: ticket.version + 1,
  });
}
