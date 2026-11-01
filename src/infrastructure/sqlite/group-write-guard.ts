/** Last-line archive guard at the SQLite write boundary. */

import { DatabaseError, type DatabaseConnection, type TransactionContext } from './database-connection';

export async function assertGroupWritableDb(
  db: DatabaseConnection | TransactionContext,
  groupId: string,
): Promise<void> {
  const row = await db.get<{ archived_at: string | null; deleted_at: string | null }>(
    'select archived_at, deleted_at from groups where id = ?',
    [groupId],
  );
  if (row === null) {
    throw new DatabaseError('Group not found.', { code: 'GROUP_NOT_FOUND' });
  }
  if (row.deleted_at !== null) {
    throw new DatabaseError('This group has been deleted.', { code: 'GROUP_DELETED' });
  }
  if (row.archived_at !== null) {
    throw new DatabaseError(
      'This group is archived and read-only. Restore it before changing financial data.',
      { code: 'GROUP_ARCHIVED' },
    );
  }
}
