/**
 * SQLite implementation of `EncryptedSyncStore`.
 *
 * Uses migration 0008. All methods are small, parameterised statements;
 * no financial values are stored here beyond conflict payloads, which are
 * already-encrypted-in-transit JSON and stay on the device.
 */

import type {
  DeviceMembershipRecord,
  EncryptedConflictRecord,
  EncryptedSyncStore,
  KeyEpochRecord,
  ProcessedEventRecord,
} from '@application/sync/encrypted-sync-store.port';

import type { DatabaseConnection, SqlRow } from './database-connection';

function toProcessed(row: SqlRow): ProcessedEventRecord {
  return {
    eventId: row['event_id'] as string,
    groupId: row['group_id'] as string,
    deviceId: row['device_id'] as string,
    keyId: row['key_id'] as string,
    digest: row['digest'] as string,
    status: row['status'] as ProcessedEventRecord['status'],
    receivedAt: row['received_at'] as string,
    ...(row['processed_at'] ? { processedAt: row['processed_at'] as string } : {}),
    ...(row['acknowledged_at']
      ? { acknowledgedAt: row['acknowledged_at'] as string }
      : {}),
    ...(row['error'] ? { error: row['error'] as string } : {}),
  };
}

function toConflict(row: SqlRow): EncryptedConflictRecord {
  return {
    id: row['id'] as string,
    groupId: row['group_id'] as string,
    eventId: row['event_id'] as string,
    entityType: row['entity_type'] as string,
    entityId: row['entity_id'] as string,
    localVersion: row['local_version'] as number,
    remoteVersion: row['remote_version'] as number,
    localPayload: row['local_payload'] as string,
    remotePayload: row['remote_payload'] as string,
    status: row['status'] as EncryptedConflictRecord['status'],
    createdAt: row['created_at'] as string,
    ...(row['resolved_at'] ? { resolvedAt: row['resolved_at'] as string } : {}),
  };
}

export class SqliteEncryptedSyncStore implements EncryptedSyncStore {
  constructor(private readonly db: DatabaseConnection) {}

  async getProcessedEvent(eventId: string): Promise<ProcessedEventRecord | null> {
    const row = await this.db.get<SqlRow>(
      'select * from sync_processed_events where event_id = ?',
      [eventId],
    );
    return row ? toProcessed(row) : null;
  }

  async beginProcessing(input: {
    readonly eventId: string;
    readonly groupId: string;
    readonly deviceId: string;
    readonly keyId: string;
    readonly digest: string;
    readonly at: string;
  }): Promise<void> {
    await this.db.run(
      `insert into sync_processed_events
         (event_id, group_id, device_id, key_id, digest, status, received_at)
       values (?, ?, ?, ?, ?, 'applying', ?)
       on conflict(event_id) do update set
         status = 'applying', digest = excluded.digest, error = null`,
      [input.eventId, input.groupId, input.deviceId, input.keyId, input.digest, input.at],
    );
  }

  async markProcessed(eventId: string, digest: string, at: string): Promise<void> {
    await this.db.run(
      `update sync_processed_events
         set status = 'processed', digest = ?, processed_at = ?, error = null
       where event_id = ?`,
      [digest, at, eventId],
    );
  }

  async markConflict(eventId: string, detail: string, at: string): Promise<void> {
    await this.db.run(
      `update sync_processed_events
         set status = 'conflict', error = ?, processed_at = ?
       where event_id = ?`,
      [detail.slice(0, 500), at, eventId],
    );
  }

  async markFailed(eventId: string, error: string, at: string): Promise<void> {
    await this.db.run(
      `update sync_processed_events
         set status = 'failed', error = ?, processed_at = ?
       where event_id = ?`,
      [error.slice(0, 500), at, eventId],
    );
  }

  async listPendingAcks(groupId: string): Promise<readonly string[]> {
    const rows = await this.db.all<{ event_id: string }>(
      `select event_id from sync_processed_events
        where group_id = ? and status = 'processed' and acknowledged_at is null
        order by processed_at asc`,
      [groupId],
    );
    return rows.map((row) => row.event_id);
  }

  async markAcknowledged(eventIds: readonly string[], at: string): Promise<void> {
    for (const eventId of eventIds) {
      await this.db.run(
        'update sync_processed_events set acknowledged_at = ? where event_id = ? and acknowledged_at is null',
        [at, eventId],
      );
    }
  }

  async recordConflict(record: EncryptedConflictRecord): Promise<void> {
    await this.db.run(
      `insert or ignore into sync_event_conflicts
         (id, group_id, event_id, entity_type, entity_id, local_version, remote_version,
          local_payload, remote_payload, status, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unresolved', ?)`,
      [
        record.id,
        record.groupId,
        record.eventId,
        record.entityType,
        record.entityId,
        record.localVersion,
        record.remoteVersion,
        record.localPayload,
        record.remotePayload,
        record.createdAt,
      ],
    );
  }

  async listConflicts(
    groupId: string,
    status: EncryptedConflictRecord['status'] = 'unresolved',
  ): Promise<readonly EncryptedConflictRecord[]> {
    const rows = await this.db.all<SqlRow>(
      'select * from sync_event_conflicts where group_id = ? and status = ? order by created_at asc',
      [groupId, status],
    );
    return rows.map(toConflict);
  }

  async resolveConflict(
    id: string,
    status: 'keep_local' | 'accept_remote',
    at: string,
  ): Promise<void> {
    await this.db.run(
      'update sync_event_conflicts set status = ?, resolved_at = ? where id = ?',
      [status, at, id],
    );
  }

  async upsertMembership(record: DeviceMembershipRecord): Promise<void> {
    await this.db.run(
      `insert into sync_device_memberships
         (group_id, device_id, signing_public_key, encryption_public_key, status, added_at, removed_at)
       values (?, ?, ?, ?, ?, ?, ?)
       on conflict(group_id, device_id) do update set
         signing_public_key = excluded.signing_public_key,
         encryption_public_key = excluded.encryption_public_key,
         status = excluded.status,
         removed_at = excluded.removed_at`,
      [
        record.groupId,
        record.deviceId,
        record.signingPublicKey,
        record.encryptionPublicKey,
        record.status,
        record.addedAt,
        record.removedAt ?? null,
      ],
    );
  }

  async listMemberships(groupId: string): Promise<readonly DeviceMembershipRecord[]> {
    const rows = await this.db.all<SqlRow>(
      'select * from sync_device_memberships where group_id = ? order by added_at asc',
      [groupId],
    );
    return rows.map((row) => ({
      groupId: row['group_id'] as string,
      deviceId: row['device_id'] as string,
      signingPublicKey: row['signing_public_key'] as string,
      encryptionPublicKey: row['encryption_public_key'] as string,
      status: row['status'] as DeviceMembershipRecord['status'],
      addedAt: row['added_at'] as string,
      ...(row['removed_at'] ? { removedAt: row['removed_at'] as string } : {}),
    }));
  }

  async putKeyEpoch(record: KeyEpochRecord): Promise<void> {
    await this.db.run(
      `insert or ignore into sync_key_epochs (group_id, key_id, created_at, retired_at)
       values (?, ?, ?, ?)`,
      [record.groupId, record.keyId, record.createdAt, record.retiredAt ?? null],
    );
  }

  async listKeyEpochs(groupId: string): Promise<readonly KeyEpochRecord[]> {
    const rows = await this.db.all<SqlRow>(
      'select * from sync_key_epochs where group_id = ? order by created_at asc',
      [groupId],
    );
    return rows.map((row) => ({
      groupId: row['group_id'] as string,
      keyId: row['key_id'] as string,
      createdAt: row['created_at'] as string,
      ...(row['retired_at'] ? { retiredAt: row['retired_at'] as string } : {}),
    }));
  }

  async retireKeyEpoch(groupId: string, keyId: string, at: string): Promise<void> {
    await this.db.run(
      'update sync_key_epochs set retired_at = ? where group_id = ? and key_id = ?',
      [at, groupId, keyId],
    );
  }

  async saveCursor(
    groupId: string,
    deviceId: string,
    lastCreatedAt: string,
    at: string,
  ): Promise<void> {
    await this.db.run(
      `insert into sync_event_cursors (group_id, device_id, last_created_at, updated_at)
       values (?, ?, ?, ?)
       on conflict(group_id, device_id) do update set
         last_created_at = excluded.last_created_at, updated_at = excluded.updated_at`,
      [groupId, deviceId, lastCreatedAt, at],
    );
  }

  async getCursor(groupId: string, deviceId: string): Promise<string | null> {
    const row = await this.db.get<{ last_created_at: string | null }>(
      'select last_created_at from sync_event_cursors where group_id = ? and device_id = ?',
      [groupId, deviceId],
    );
    return row?.last_created_at ?? null;
  }
}
