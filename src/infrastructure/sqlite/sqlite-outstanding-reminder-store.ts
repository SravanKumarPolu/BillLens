/**
 * SQLite-backed {@link OutstandingReminderStore} — migration 0013.
 *
 * One row per reminder identifier (`outstanding_reminder_state`). The row
 * records the *decision*, never the notification text: a count of groups
 * with an open balance is enough to reconcile on resume and cannot leak
 * financial detail.
 *
 * Read/write always goes through the primary key, so the table needs no
 * secondary index.
 */

import type {
  OutstandingReminderRecord,
  OutstandingReminderStatus,
  OutstandingReminderStore,
  ReminderDelivery,
} from '@application/notifications/notification-capability.port';

import type { DatabaseConnection, SqlRow } from './database-connection';

const STATUSES: readonly OutstandingReminderStatus[] = [
  'scheduled',
  'none',
  'denied',
  'unsupported',
  'disabled',
  'error',
];

const DELIVERIES: readonly ReminderDelivery[] = ['native', 'stored_only', 'none'];

export class SqliteOutstandingReminderStore implements OutstandingReminderStore {
  constructor(private readonly db: DatabaseConnection) {}

  async load(id: string): Promise<OutstandingReminderRecord | null> {
    const row = await this.db.get<SqlRow>(
      `select id, status, delivery, groups_with_balance, evaluated_at, scheduled_at
         from outstanding_reminder_state
        where id = ?`,
      [id],
    );
    if (row === null) return null;

    const scheduledAt = row.scheduled_at;
    return {
      id: String(row.id),
      status: toStatus(row.status),
      delivery: toDelivery(row.delivery),
      groupsWithBalance: toCount(row.groups_with_balance),
      evaluatedAt: String(row.evaluated_at),
      scheduledAt: typeof scheduledAt === 'string' ? scheduledAt : null,
    };
  }

  async save(record: OutstandingReminderRecord): Promise<void> {
    const existing = await this.db.get<SqlRow>(
      'select id from outstanding_reminder_state where id = ?',
      [record.id],
    );

    if (existing !== null) {
      await this.db.run(
        `update outstanding_reminder_state
            set status = ?,
                delivery = ?,
                groups_with_balance = ?,
                evaluated_at = ?,
                scheduled_at = ?
          where id = ?`,
        [
          record.status,
          record.delivery,
          record.groupsWithBalance,
          record.evaluatedAt,
          record.scheduledAt,
          record.id,
        ],
      );
      return;
    }

    await this.db.run(
      `insert into outstanding_reminder_state
         (id, status, delivery, groups_with_balance, evaluated_at, scheduled_at)
       values (?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.status,
        record.delivery,
        record.groupsWithBalance,
        record.evaluatedAt,
        record.scheduledAt,
      ],
    );
  }

  async clear(id: string): Promise<void> {
    await this.db.run('delete from outstanding_reminder_state where id = ?', [id]);
  }
}

function toStatus(value: unknown): OutstandingReminderStatus {
  return STATUSES.includes(value as OutstandingReminderStatus)
    ? (value as OutstandingReminderStatus)
    : 'error';
}

function toDelivery(value: unknown): ReminderDelivery {
  return DELIVERIES.includes(value as ReminderDelivery)
    ? (value as ReminderDelivery)
    : 'none';
}

function toCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return 0;
}
