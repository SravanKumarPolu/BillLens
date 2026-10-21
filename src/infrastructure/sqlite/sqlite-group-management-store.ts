/** SQLite counts and transactional cascade deletion for group management. */

import type {
  GroupFinancialCounts,
  GroupManagementStore,
} from '@application/groups/group-management.usecases';

import type { DatabaseConnection } from './database-connection';

export class SqliteGroupManagementStore implements GroupManagementStore {
  constructor(private readonly db: DatabaseConnection) {}

  async getFinancialCounts(groupId: string): Promise<GroupFinancialCounts> {
    const expenses = await this.db.get<{ count: number }>(
      'select count(*) as count from expenses where group_id = ?',
      [groupId],
    );
    const settlements = await this.db.get<{ count: number }>(
      'select count(*) as count from settlements where group_id = ?',
      [groupId],
    );
    return {
      expenses: Number(expenses?.count ?? 0),
      settlements: Number(settlements?.count ?? 0),
    };
  }

  async countMemberReferences(_groupId: string, memberId: string): Promise<number> {
    const row = await this.db.get<{ count: number }>(
      `select
         (select count(*) from expense_splits where member_id = ?) +
         (select count(*) from expense_payers where member_id = ?) +
         (select count(*) from settlements where from_member_id = ? or to_member_id = ?) as count`,
      [memberId, memberId, memberId, memberId],
    );
    return Number(row?.count ?? 0);
  }

  async countReceiptFiles(groupId: string): Promise<number> {
    const row = await this.db.get<{ count: number }>(
      "select count(*) as count from receipts where group_id = ? and image_uri is not null and image_uri <> ''",
      [groupId],
    );
    return Number(row?.count ?? 0);
  }

  async deleteGroupCascade(groupId: string): Promise<readonly string[]> {
    return this.db.transaction(async (tx) => {
      const rows = await tx.all<{ image_uri: string }>(
        "select image_uri from receipts where group_id = ? and image_uri is not null and image_uri <> ''",
        [groupId],
      );

      const statements: readonly [string, readonly string[]][] = [
        ['delete from settlement_reminders where group_id = ?', [groupId]],
        [
          'delete from settlement_state_history where settlement_id in (select id from settlements where group_id = ?)',
          [groupId],
        ],
        ['delete from settlements where group_id = ?', [groupId]],
        [
          'delete from expense_payers where expense_id in (select id from expenses where group_id = ?)',
          [groupId],
        ],
        [
          'delete from expense_splits where expense_id in (select id from expenses where group_id = ?)',
          [groupId],
        ],
        ['delete from expenses where group_id = ?', [groupId]],
        [
          'delete from recurring_occurrences where recurring_id in (select id from recurring_expenses where group_id = ?)',
          [groupId],
        ],
        ['delete from recurring_expenses where group_id = ?', [groupId]],
        [
          'delete from receipt_items where receipt_id in (select id from receipts where group_id = ?)',
          [groupId],
        ],
        ['delete from receipts where group_id = ?', [groupId]],
        [
          'delete from member_payment_handles where member_id in (select id from group_members where group_id = ?)',
          [groupId],
        ],
        ['delete from group_invites where group_id = ?', [groupId]],
        ['delete from group_members where group_id = ?', [groupId]],
        ['delete from groups where id = ?', [groupId]],
      ];
      for (const [sql, params] of statements) await tx.run(sql, params);
      return rows.map((row) => row.image_uri);
    });
  }
}
