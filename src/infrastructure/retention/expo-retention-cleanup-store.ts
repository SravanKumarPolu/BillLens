/** File + SQLite adapter for bounded orphan temp-file cleanup. */

import { Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';

import type { RetentionCleanupStore } from '@application/retention/retention-cleanup.usecase';

import type { DatabaseConnection } from '../sqlite/database-connection';

const TEMP_DIRS = ['billlens-images', 'billlens-restored-receipts'];

function joinUri(base: string, name: string): string {
  return `${base.replace(/\/$/, '')}/${name}`;
}

export class ExpoRetentionCleanupStore implements RetentionCleanupStore {
  constructor(private readonly db: DatabaseConnection) {}

  async findOrphanFiles(cutoffIso: string, limit: number): Promise<readonly string[]> {
    const cutoff = Date.parse(cutoffIso);
    const rows = await this.db.all<{ uri: string }>(
      `select image_uri as uri from receipts where image_uri is not null and image_uri <> ''
       union
       select image_uri as uri from capture_sources where image_uri is not null and image_uri <> ''`,
    );
    const referenced = new Set(rows.map((row) => row.uri));
    const candidates: string[] = [];

    for (const dirName of TEMP_DIRS) {
      const base = dirName === 'billlens-images' ? Paths.cache.uri : Paths.document.uri;
      const dir = joinUri(base, dirName);
      let names: string[];
      try {
        names = await LegacyFileSystem.readDirectoryAsync(dir);
      } catch {
        continue;
      }
      for (const name of names) {
        if (candidates.length >= limit) return candidates;
        const uri = joinUri(dir, name);
        if (referenced.has(uri)) continue;
        try {
          const info = await LegacyFileSystem.getInfoAsync(uri);
          if (!info.exists || info.isDirectory) continue;
          if (info.modificationTime * 1000 >= cutoff) continue;
          candidates.push(uri);
        } catch {
          // Unreadable entries are left for manual review.
        }
      }
    }
    return candidates;
  }

  async enqueueCleanup(uris: readonly string[], nowIso: string): Promise<number> {
    let queued = 0;
    for (const uri of uris) {
      const existing = await this.db.get<{ id: string }>(
        'select id from file_cleanup_queue where uri = ? and completed_at is null limit 1',
        [uri],
      );
      if (existing !== null) continue;
      await this.db.run(
        `insert into file_cleanup_queue
           (id, uri, reason, attempts, last_error, next_attempt_at, created_at, updated_at)
         values (?, ?, 'retention_temp', 0, null, ?, ?, ?)`,
        [`retention-${Date.now()}-${queued}`, uri, nowIso, nowIso, nowIso],
      );
      queued += 1;
    }
    return queued;
  }
}
