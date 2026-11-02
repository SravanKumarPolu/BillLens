/**
 * SQLite-backed {@link SettlementReminderRepository} — Prompt 59.
 *
 * Persists per-settlement payment follow-ups in `settlement_reminders`
 * (migration 0002 + version column from migration 0014). Reminders are a
 * local, device-owned surface: unlike settlements they do NOT enqueue an
 * offline-sync operation. Multi-device reminder sync is not a shipped
 * capability (KL-4); inventing a sync envelope here would promise a
 * delivery path the product does not have.
 *
 * Every read is explicit about optionality: the columns behind
 * `settlementId`, `payerMemberId`, `receiverMemberId`, `amountMinor`,
 * `sentAt`, `cancelledAt` and `autoCancelReason` are nullable.
 */

import type { SettlementReminder } from '@domain/entities/settlement-reminder';
import { asReminderId } from '@domain/entities/settlement-reminder';
import type { SettlementReminderRepository } from '@domain/repositories/settlement-reminder.repository';
import type {
  PaginatedResult,
  Pagination,
} from '@domain/repositories/repository-contracts';
import {
  asCurrencyCode,
  asDateTime,
  asVersionNumber,
} from '@domain/value-objects';
import type { CurrencyCode, DateTime, VersionNumber } from '@domain/value-objects';
import type {
  GroupId,
  MemberId,
  SettlementId,
  UserId,
} from '@shared-types/index';
import { asGroupId } from '@domain/entities/group';
import { asMemberId } from '@domain/entities/group-member';
import { asSettlementId } from '@domain/entities/settlement';
import { asUserId } from '@domain/entities/user';

import type { DatabaseConnection, SqlRow } from './database-connection';
import { paginateRows, parseOffsetCursor } from './row-mappers';

const REMINDER_COLUMNS = `
  id, group_id, settlement_id, payer_member_id, receiver_member_id,
  currency_code, amount_minor, reminder_type, scheduled_at, status,
  privacy_mode, created_by, created_at, updated_at, sent_at, cancelled_at,
  auto_cancel_reason, version
`;

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function mapReminderRow(row: SqlRow): SettlementReminder {
  const status = String(row.status) as SettlementReminder['status'];
  return {
    id: asReminderId(String(row.id)),
    groupId: asGroupId(String(row.group_id)),
    ...(optionalString(row.settlement_id) !== undefined
      ? { settlementId: asSettlementId(String(row.settlement_id)) }
      : {}),
    ...(optionalString(row.payer_member_id) !== undefined
      ? { payerMemberId: asMemberId(String(row.payer_member_id)) }
      : {}),
    ...(optionalString(row.receiver_member_id) !== undefined
      ? { receiverMemberId: asMemberId(String(row.receiver_member_id)) }
      : {}),
    currencyCode: asCurrencyCode(String(row.currency_code)) as CurrencyCode,
    ...(optionalNumber(row.amount_minor) !== undefined
      ? { amountMinor: optionalNumber(row.amount_minor) }
      : {}),
    reminderType: String(row.reminder_type) as SettlementReminder['reminderType'],
    scheduledAt: asDateTime(String(row.scheduled_at)) as DateTime,
    status,
    privacyMode: String(row.privacy_mode) as SettlementReminder['privacyMode'],
    createdBy: asUserId(String(row.created_by)) as UserId,
    createdAt: asDateTime(String(row.created_at)) as DateTime,
    updatedAt: asDateTime(String(row.updated_at)) as DateTime,
    ...(optionalString(row.sent_at) !== undefined
      ? { sentAt: asDateTime(String(row.sent_at)) as DateTime }
      : {}),
    ...(optionalString(row.cancelled_at) !== undefined
      ? { cancelledAt: asDateTime(String(row.cancelled_at)) as DateTime }
      : {}),
    ...(optionalString(row.auto_cancel_reason) !== undefined
      ? {
          autoCancelReason: String(
            row.auto_cancel_reason,
          ) as SettlementReminder['autoCancelReason'],
        }
      : {}),
    version: asVersionNumber(Number(row.version ?? 1)) as VersionNumber,
  };
}

export class SqliteSettlementReminderRepository
  implements SettlementReminderRepository
{
  constructor(private readonly db: DatabaseConnection) {}

  async findById(id: string): Promise<SettlementReminder | null> {
    const row = await this.db.get<SqlRow>(
      `select ${REMINDER_COLUMNS} from settlement_reminders where id = ?`,
      [id],
    );
    return row === null ? null : mapReminderRow(row);
  }

  async listByGroup(
    groupId: GroupId,
    filter?: { readonly status?: SettlementReminder['status'] },
    pagination?: Pagination,
  ): Promise<PaginatedResult<SettlementReminder>> {
    const limit = Math.max(1, pagination?.limit ?? 50);
    const offset = parseOffsetCursor(pagination?.cursor);
    const params: Array<string | number> = [String(groupId)];
    let where = 'where group_id = ?';
    if (filter?.status !== undefined) {
      where += ' and status = ?';
      params.push(filter.status);
    }
    const rows = await this.db.all<SqlRow>(
      `select ${REMINDER_COLUMNS} from settlement_reminders
        ${where}
        order by scheduled_at asc, id asc
        limit ? offset ?`,
      [...params, limit + 1, offset],
    );
    return paginateRows(rows.map(mapReminderRow), limit, offset);
  }

  async findMostRecentForCoolDown(
    groupId: GroupId,
    payerMemberId: MemberId,
    receiverMemberId: MemberId,
    currencyCode: string,
  ): Promise<SettlementReminder | null> {
    const row = await this.db.get<SqlRow>(
      `select ${REMINDER_COLUMNS} from settlement_reminders
        where group_id = ?
          and payer_member_id = ?
          and receiver_member_id = ?
          and currency_code = ?
          and status in ('scheduled', 'sent')
        order by scheduled_at desc
        limit 1`,
      [String(groupId), String(payerMemberId), String(receiverMemberId), currencyCode],
    );
    return row === null ? null : mapReminderRow(row);
  }

  async findScheduledForSettlement(
    settlementId: SettlementId,
  ): Promise<readonly SettlementReminder[]> {
    const rows = await this.db.all<SqlRow>(
      `select ${REMINDER_COLUMNS} from settlement_reminders
        where settlement_id = ? and status = 'scheduled'
        order by scheduled_at asc`,
      [String(settlementId)],
    );
    return rows.map(mapReminderRow);
  }

  async findScheduledForPayer(
    groupId: GroupId,
    payerMemberId: MemberId,
  ): Promise<readonly SettlementReminder[]> {
    const rows = await this.db.all<SqlRow>(
      `select ${REMINDER_COLUMNS} from settlement_reminders
        where group_id = ? and payer_member_id = ? and status = 'scheduled'
        order by scheduled_at asc`,
      [String(groupId), String(payerMemberId)],
    );
    return rows.map(mapReminderRow);
  }

  async save(reminder: SettlementReminder): Promise<void> {
    const existing = await this.db.get<SqlRow>(
      'select id from settlement_reminders where id = ?',
      [String(reminder.id)],
    );

    if (existing === null) {
      await this.db.run(
        `insert into settlement_reminders (
           id, group_id, settlement_id, payer_member_id, receiver_member_id,
           currency_code, amount_minor, reminder_type, scheduled_at, status,
           privacy_mode, created_by, created_at, updated_at, sent_at,
           cancelled_at, auto_cancel_reason, version
         ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(reminder.id),
          String(reminder.groupId),
          reminder.settlementId !== undefined ? String(reminder.settlementId) : null,
          reminder.payerMemberId !== undefined ? String(reminder.payerMemberId) : null,
          reminder.receiverMemberId !== undefined
            ? String(reminder.receiverMemberId)
            : null,
          String(reminder.currencyCode),
          reminder.amountMinor !== undefined ? reminder.amountMinor : null,
          String(reminder.reminderType),
          String(reminder.scheduledAt),
          String(reminder.status),
          String(reminder.privacyMode),
          String(reminder.createdBy),
          String(reminder.createdAt),
          String(reminder.updatedAt),
          reminder.sentAt !== undefined ? String(reminder.sentAt) : null,
          reminder.cancelledAt !== undefined ? String(reminder.cancelledAt) : null,
          reminder.autoCancelReason !== undefined
            ? String(reminder.autoCancelReason)
            : null,
          Number(reminder.version),
        ],
      );
      return;
    }

    await this.db.run(
      `update settlement_reminders set
         settlement_id = ?, payer_member_id = ?, receiver_member_id = ?,
         currency_code = ?, amount_minor = ?, reminder_type = ?,
         scheduled_at = ?, status = ?, privacy_mode = ?, created_by = ?,
         created_at = ?, updated_at = ?, sent_at = ?, cancelled_at = ?,
         auto_cancel_reason = ?, version = ?
       where id = ?`,
      [
        reminder.settlementId !== undefined ? String(reminder.settlementId) : null,
        reminder.payerMemberId !== undefined ? String(reminder.payerMemberId) : null,
        reminder.receiverMemberId !== undefined
          ? String(reminder.receiverMemberId)
          : null,
        String(reminder.currencyCode),
        reminder.amountMinor !== undefined ? reminder.amountMinor : null,
        String(reminder.reminderType),
        String(reminder.scheduledAt),
        String(reminder.status),
        String(reminder.privacyMode),
        String(reminder.createdBy),
        String(reminder.createdAt),
        String(reminder.updatedAt),
        reminder.sentAt !== undefined ? String(reminder.sentAt) : null,
        reminder.cancelledAt !== undefined ? String(reminder.cancelledAt) : null,
        reminder.autoCancelReason !== undefined
          ? String(reminder.autoCancelReason)
          : null,
        Number(reminder.version),
        String(reminder.id),
      ],
    );
  }

  async delete(id: string): Promise<void> {
    await this.db.run('delete from settlement_reminders where id = ?', [id]);
  }
}
