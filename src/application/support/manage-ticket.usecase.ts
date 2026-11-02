/**
 * Use case: Manage a support ticket — create, update, assign, transition.
 *
 * Privacy contract:
 *   1. The raw subject + body are PII-redacted BEFORE the ticket is
 *      constructed. The repository only ever sees redacted text.
 *   2. The use case validates the ticket shape + lifecycle transition.
 *   3. The use case generates a stable ticket number via the
 *      `TicketSequencePort`.
 *   4. The use case NEVER accesses raw receipt images, UPI IDs, or
 *      payment references — that is gated by the
 *      `request-sensitive-data-access.usecase.ts`.
 */

import { redactFeedbackBody } from '@domain/feedback';
import {
  TICKET_BODY_MAX_LENGTH,
  TICKET_SUBJECT_MAX_LENGTH,
  assignTicket,
  createTicket,
  isTicketChannel,
  isTicketPriority,
  isTicketStatus,
  recordCsat,
  transitionTicket,
  type SupportTicket,
  type TicketChannel,
  type TicketPriority,
  type TicketStatus,
} from '@domain/support';

import type {
  SupportTicketRepository,
  TicketSequencePort,
} from './support-repository.port';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface CreateTicketInput {
  readonly id: string;
  readonly subject: string;
  readonly body: string;
  readonly priority: TicketPriority;
  readonly channel: TicketChannel;
  readonly requesterId: string;
  readonly category?: string | null;
  readonly tags?: readonly string[];
  readonly createdAt: string;
}

export interface UpdateTicketInput {
  readonly ticketId: string;
  readonly subject?: string;
  readonly body?: string;
  readonly priority?: TicketPriority;
  readonly category?: string | null;
  readonly tags?: readonly string[];
  readonly updatedAt: string;
}

export interface TransitionTicketInput {
  readonly ticketId: string;
  readonly to: TicketStatus;
  readonly nowIso: string;
}

export interface AssignTicketInput {
  readonly ticketId: string;
  readonly assigneeId: string;
  readonly nowIso: string;
}

export interface RecordCsatInput {
  readonly ticketId: string;
  readonly csatScore: number;
  readonly nowIso: string;
}

export interface ManageTicketOutput {
  readonly ticket: SupportTicket;
  readonly redactedSubject: boolean;
  readonly redactedBody: boolean;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class ManageTicketUseCase {
  constructor(
    private readonly ticketRepo: SupportTicketRepository,
    private readonly sequence: TicketSequencePort,
  ) {}

  // ---- Create ----

  async createTicket(input: CreateTicketInput): Promise<ManageTicketOutput> {
    if (input.id.trim().length === 0) {
      throw new Error('Ticket id must not be empty');
    }
    if (input.subject.trim().length === 0) {
      throw new Error('Ticket subject must not be empty');
    }
    if (input.subject.length > TICKET_SUBJECT_MAX_LENGTH * 2) {
      throw new Error(
        `Ticket subject too long: ${input.subject.length} > ${TICKET_SUBJECT_MAX_LENGTH * 2}`,
      );
    }
    if (input.body.length > TICKET_BODY_MAX_LENGTH * 2) {
      throw new Error(
        `Ticket body too long: ${input.body.length} > ${TICKET_BODY_MAX_LENGTH * 2}`,
      );
    }
    if (!isTicketPriority(input.priority)) {
      throw new Error(`Unknown ticket priority: ${input.priority}`);
    }
    if (!isTicketChannel(input.channel)) {
      throw new Error(`Unknown ticket channel: ${input.channel}`);
    }
    if (input.requesterId.trim().length === 0) {
      throw new Error('Ticket requesterId must not be empty');
    }
    if (Number.isNaN(Date.parse(input.createdAt))) {
      throw new Error('createdAt must be a valid ISO date-time');
    }

    // 1. Redact subject + body (defence-in-depth — never persist raw PII).
    const redactedSubject = redactFeedbackBody(input.subject, 'standard').slice(
      0,
      TICKET_SUBJECT_MAX_LENGTH,
    );
    const redactedBody = redactFeedbackBody(input.body, 'standard').slice(
      0,
      TICKET_BODY_MAX_LENGTH,
    );

    // 2. Generate a ticket number via the sequence port.
    const ticketNumber = await this.sequence.nextTicketNumber();

    // 3. Construct the ticket entity.
    const ticket = createTicket({
      id: input.id,
      ticketNumber,
      subject: redactedSubject,
      body: redactedBody,
      status: 'new',
      priority: input.priority,
      channel: input.channel,
      createdAt: input.createdAt,
      requesterId: input.requesterId,
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
    });

    // 4. Persist.
    await this.ticketRepo.save(ticket);

    return {
      ticket,
      redactedSubject: redactedSubject !== input.subject,
      redactedBody: redactedBody !== input.body,
    };
  }

  // ---- Update ----

  async updateTicket(input: UpdateTicketInput): Promise<ManageTicketOutput> {
    const existing = await this.ticketRepo.findById(input.ticketId);
    if (existing === null) {
      throw new Error(`Ticket not found: ${input.ticketId}`);
    }
    if (Number.isNaN(Date.parse(input.updatedAt))) {
      throw new Error('updatedAt must be a valid ISO date-time');
    }

    let subject = existing.subject;
    let body = existing.body;
    let redactedSubject = false;
    let redactedBody = false;
    if (input.subject !== undefined) {
      if (input.subject.length > TICKET_SUBJECT_MAX_LENGTH * 2) {
        throw new Error(
          `Ticket subject too long: ${input.subject.length} > ${TICKET_SUBJECT_MAX_LENGTH * 2}`,
        );
      }
      const redacted = redactFeedbackBody(input.subject, 'standard').slice(
        0,
        TICKET_SUBJECT_MAX_LENGTH,
      );
      redactedSubject = redacted !== input.subject;
      subject = redacted;
    }
    if (input.body !== undefined) {
      if (input.body.length > TICKET_BODY_MAX_LENGTH * 2) {
        throw new Error(
          `Ticket body too long: ${input.body.length} > ${TICKET_BODY_MAX_LENGTH * 2}`,
        );
      }
      const redacted = redactFeedbackBody(input.body, 'standard').slice(
        0,
        TICKET_BODY_MAX_LENGTH,
      );
      redactedBody = redacted !== input.body;
      body = redacted;
    }
    if (input.priority !== undefined && !isTicketPriority(input.priority)) {
      throw new Error(`Unknown ticket priority: ${input.priority}`);
    }

    const updated: SupportTicket = {
      ...existing,
      subject,
      body,
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.tags !== undefined ? { tags: Object.freeze([...input.tags]) } : {}),
      updatedAt: input.updatedAt,
      version: existing.version + 1,
    };

    await this.ticketRepo.save(updated);

    return {
      ticket: updated,
      redactedSubject,
      redactedBody,
    };
  }

  // ---- Transition ----

  async transitionTicket(input: TransitionTicketInput): Promise<ManageTicketOutput> {
    const existing = await this.ticketRepo.findById(input.ticketId);
    if (existing === null) {
      throw new Error(`Ticket not found: ${input.ticketId}`);
    }
    if (!isTicketStatus(input.to)) {
      throw new Error(`Unknown ticket status: ${input.to}`);
    }
    const updated = transitionTicket(existing, input.to, input.nowIso);
    await this.ticketRepo.save(updated);
    return { ticket: updated, redactedSubject: false, redactedBody: false };
  }

  // ---- Assign ----

  async assignTicket(input: AssignTicketInput): Promise<ManageTicketOutput> {
    const existing = await this.ticketRepo.findById(input.ticketId);
    if (existing === null) {
      throw new Error(`Ticket not found: ${input.ticketId}`);
    }
    const updated = assignTicket(existing, input.assigneeId, input.nowIso);
    await this.ticketRepo.save(updated);
    return { ticket: updated, redactedSubject: false, redactedBody: false };
  }

  // ---- CSAT ----

  async recordCsat(input: RecordCsatInput): Promise<ManageTicketOutput> {
    const existing = await this.ticketRepo.findById(input.ticketId);
    if (existing === null) {
      throw new Error(`Ticket not found: ${input.ticketId}`);
    }
    const updated = recordCsat(existing, input.csatScore, input.nowIso);
    await this.ticketRepo.save(updated);
    return { ticket: updated, redactedSubject: false, redactedBody: false };
  }
}
