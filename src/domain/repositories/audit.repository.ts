import type { GroupId, UserId } from '@shared-types/index';

import type { DateTime } from '../value-objects/date-time';

import type { PaginatedResult, Pagination } from './repository-contracts';

/**
 * Audit log entry — append-only record of a financial mutation.
 *
 * IMPORTANT: never store full receipt text, card details, UPI IDs, or
 * transaction references here. Only the change summary.
 */
export interface AuditLogEntry {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly action: 'create' | 'update' | 'delete' | 'restore' | 'sync';
  readonly actorId?: UserId;
  readonly groupId?: GroupId;
  readonly previousVersion?: number;
  readonly newVersion?: number;
  /** Structured summary of what changed (field names + before/after for key fields). */
  readonly changeSummary?: Readonly<Record<string, unknown>>;
  readonly createdAt: DateTime;
}

/**
 * Repository for the `audit_logs` table.
 *
 * Audit logs are append-only. There is NO update or delete method — once
 * written, an audit entry is immutable. This is enforced by the
 * infrastructure implementation (the underlying table has no UPDATE
 * grant for the application role).
 */
export interface AuditRepository {
  /** Append a new audit entry. The id is client-generated. */
  append(entry: Omit<AuditLogEntry, 'createdAt'>): Promise<AuditLogEntry>;
  /** List audit entries for an entity, ordered by createdAt ASC. */
  listByEntity(entityType: string, entityId: string): Promise<readonly AuditLogEntry[]>;
  /** List audit entries by actor, paginated. */
  listByActor(actorId: UserId, pagination: Pagination): Promise<PaginatedResult<AuditLogEntry>>;
  /** List audit entries for a group, paginated. */
  listByGroup(groupId: GroupId, pagination: Pagination): Promise<PaginatedResult<AuditLogEntry>>;
}
