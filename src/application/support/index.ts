/**
 * Barrel for the support application module.
 */

export {
  ManageTicketUseCase,
  type AssignTicketInput,
  type CreateTicketInput,
  type ManageTicketOutput,
  type RecordCsatInput,
  type TransitionTicketInput,
  type UpdateTicketInput,
} from './manage-ticket.usecase';

export {
  RequestSensitiveDataAccessUseCase,
  type RequestSensitiveDataAccessInput,
  type RequestSensitiveDataAccessOutput,
} from './request-sensitive-data-access.usecase';

export type {
  DataAccessAuditRepository,
  SupportTicketRepository,
  TicketSequencePort,
} from './support-repository.port';
