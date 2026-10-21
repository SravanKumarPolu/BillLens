/**
 * SQLite implementation of `LocalGroupPurgePort`.
 *
 * Deletes the group row only; every child table declares
 * `on delete cascade` on its group FK (members, expenses, splits,
 * settlements, drafts), so the local copy is fully removed.
 *
 * It does NOT enqueue a sync operation — that is the whole point: this is
 * "remove my device's copy", not "delete the shared group".
 */

import type { LocalGroupPurgePort } from '@application/retention/local-group-purge.port';

import type { DatabaseConnection } from './database-connection';

export class SqliteLocalGroupPurge implements LocalGroupPurgePort {
  constructor(private readonly database: DatabaseConnection) {}

  async purgeLocalGroup(groupId: string): Promise<void> {
    await this.database.run('delete from groups where id = ?', [groupId]);
  }
}
