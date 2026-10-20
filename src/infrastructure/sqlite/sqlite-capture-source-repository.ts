/**
 * SQLite-backed implementation of the `CaptureSourceRepository` contract
 * (capture intelligence layer persistence — v2.4.0).
 *
 * Storage layout (schema `capture_sources`): one row per captured image,
 * with the canonical image hash indexed for duplicate-scan detection.
 *
 * SYNC NOTE: like expense drafts, capture sources are intentionally NOT
 * enqueued to the offline sync queue — `SyncEntityType` has no
 * `capture_source` member. Receipt images and their processing state are
 * local-only by design (privacy: `receipt_privacy_preferences` gates any
 * future image upload).
 */

import type {
  CaptureProcessingStatus,
  CaptureSource,
} from '@domain/entities/capture-source';
import type { CaptureSourceRepository } from '@domain/repositories/capture-source.repository';
import type {
  DeleteMetadata,
  PaginatedResult,
  Pagination,
  SoftDeleteResult,
} from '@domain/repositories/repository-contracts';
import { asDateTime, asVersionNumber, nowDateTime } from '@domain/value-objects';
import type { DateTime } from '@domain/value-objects/date-time';
import type { CaptureSourceId, UserId } from '@shared-types/index';

import type { DatabaseConnection, SqlRow } from './database-connection';
import { DatabaseError } from './database-connection';
import { paginateRows, parseOffsetCursor } from './row-mappers';

const SOURCE_COLUMNS = `
  id, source_type, image_uri, image_hash, mime_type, file_size_bytes,
  processing_status, processing_error, captured_by, captured_at,
  created_at, updated_at, deleted_at, version
`;

interface CaptureSourceRow extends SqlRow {
  readonly id: string;
  readonly source_type: string;
  readonly image_uri: string;
  readonly image_hash: string | null;
  readonly mime_type: string | null;
  readonly file_size_bytes: number | null;
  readonly processing_status: string;
  readonly processing_error: string | null;
  readonly captured_by: string;
  readonly captured_at: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
  readonly version: number;
}

function mapCaptureSourceRow(row: CaptureSourceRow): CaptureSource {
  return {
    id: row.id as never,
    sourceType: row.source_type as CaptureSource['sourceType'],
    imageUri: row.image_uri,
    ...(row.image_hash !== null ? { imageHash: row.image_hash } : {}),
    ...(row.mime_type !== null ? { mimeType: row.mime_type } : {}),
    ...(row.file_size_bytes !== null ? { fileSizeBytes: row.file_size_bytes } : {}),
    processingStatus: row.processing_status as CaptureProcessingStatus,
    ...(row.processing_error !== null ? { processingError: row.processing_error } : {}),
    capturedBy: row.captured_by as never,
    capturedAt: asDateTime(row.captured_at),
    createdAt: asDateTime(row.created_at),
    updatedAt: asDateTime(row.updated_at),
    version: asVersionNumber(row.version),
  };
}

export class SqliteCaptureSourceRepository implements CaptureSourceRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async findById(id: CaptureSourceId): Promise<CaptureSource | null> {
    const row = await this.db.get<CaptureSourceRow>(
      `select ${SOURCE_COLUMNS} from capture_sources where id = ? and deleted_at is null`,
      [id],
    );
    return row ? mapCaptureSourceRow(row) : null;
  }

  async findByImageHash(hash: string): Promise<CaptureSource | null> {
    const row = await this.db.get<CaptureSourceRow>(
      `select ${SOURCE_COLUMNS} from capture_sources
       where image_hash = ? and deleted_at is null
       order by updated_at desc
       limit 1`,
      [hash],
    );
    return row ? mapCaptureSourceRow(row) : null;
  }

  async listByStatus(
    status: CaptureProcessingStatus,
    pagination: Pagination,
  ): Promise<PaginatedResult<CaptureSource>> {
    const offset = parseOffsetCursor(pagination.cursor);
    const rows = await this.db.all<CaptureSourceRow>(
      `select ${SOURCE_COLUMNS} from capture_sources
       where processing_status = ? and deleted_at is null
       order by updated_at desc
       limit ? offset ?`,
      [status, pagination.limit + 1, offset],
    );
    return paginateRows(rows.map(mapCaptureSourceRow), pagination.limit, offset);
  }

  async listByUser(
    userId: UserId,
    pagination: Pagination,
  ): Promise<PaginatedResult<CaptureSource>> {
    const offset = parseOffsetCursor(pagination.cursor);
    const rows = await this.db.all<CaptureSourceRow>(
      `select ${SOURCE_COLUMNS} from capture_sources
       where captured_by = ? and deleted_at is null
       order by updated_at desc
       limit ? offset ?`,
      [userId, pagination.limit + 1, offset],
    );
    return paginateRows(rows.map(mapCaptureSourceRow), pagination.limit, offset);
  }

  async listUpdatedSince(
    userId: UserId,
    since: DateTime,
    pagination: Pagination,
  ): Promise<PaginatedResult<CaptureSource>> {
    const offset = parseOffsetCursor(pagination.cursor);
    const rows = await this.db.all<CaptureSourceRow>(
      `select ${SOURCE_COLUMNS} from capture_sources
       where captured_by = ? and deleted_at is null and updated_at > ?
       order by updated_at desc
       limit ? offset ?`,
      [userId, since as string, pagination.limit + 1, offset],
    );
    return paginateRows(rows.map(mapCaptureSourceRow), pagination.limit, offset);
  }

  /**
   * Full-replacement save (idempotent under sync replay semantics — the
   * row's version comes from the domain entity). Capture sources are
   * local-only: no sync-op co-write.
   */
  async save(source: CaptureSource): Promise<void> {
    const now = nowDateTime();
    try {
      await this.db.transaction(async (tx) => {
        const existing = await tx.get<SqlRow>(`select id from capture_sources where id = ?`, [
          source.id,
        ]);
        if (existing) {
          await tx.run(
            `update capture_sources set
               source_type = ?, image_uri = ?, image_hash = ?, mime_type = ?,
               file_size_bytes = ?, processing_status = ?, processing_error = ?,
               captured_by = ?, captured_at = ?, created_at = ?, updated_at = ?,
               deleted_at = null, version = ?, client_created_at = ?, client_updated_at = ?
             where id = ?`,
            [
              source.sourceType,
              source.imageUri,
              source.imageHash ?? null,
              source.mimeType ?? null,
              source.fileSizeBytes ?? null,
              source.processingStatus,
              source.processingError ?? null,
              source.capturedBy,
              source.capturedAt as string,
              source.createdAt as string,
              source.updatedAt as string,
              source.version,
              source.createdAt as string,
              now as string,
              source.id,
            ],
          );
        } else {
          await tx.run(
            `insert into capture_sources (
               id, source_type, image_uri, image_hash, mime_type, file_size_bytes,
               processing_status, processing_error, captured_by, captured_at,
               created_at, updated_at, deleted_at, version, client_created_at, client_updated_at
             ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, ?, ?)`,
            [
              source.id,
              source.sourceType,
              source.imageUri,
              source.imageHash ?? null,
              source.mimeType ?? null,
              source.fileSizeBytes ?? null,
              source.processingStatus,
              source.processingError ?? null,
              source.capturedBy,
              source.capturedAt as string,
              source.createdAt as string,
              source.updatedAt as string,
              source.version,
              source.createdAt as string,
              now as string,
            ],
          );
        }
      });
    } catch (error) {
      throw wrapError('CaptureSource save failed', error);
    }
  }

  /**
   * Targeted status transition (the pipeline's hot path). Bumps the row
   * version atomically; never resurrects a soft-deleted row.
   */
  async updateProcessingStatus(
    id: CaptureSourceId,
    status: CaptureProcessingStatus,
    error?: string,
  ): Promise<void> {
    const now = nowDateTime();
    try {
      const result = await this.db.run(
        `update capture_sources set
           processing_status = ?,
           processing_error = ?,
           updated_at = ?,
           version = version + 1,
           client_updated_at = ?
         where id = ? and deleted_at is null`,
        [status, error ?? null, now as string, now as string, id],
      );
      if (result.rowsAffected === 0) {
        // Idempotent no-op when the row is absent or soft-deleted — the
        // pipeline treats a missing source as already cleaned up.
      }
    } catch (error) {
      throw wrapError('CaptureSource status update failed', error);
    }
  }

  async softDelete(id: CaptureSourceId, metadata: DeleteMetadata): Promise<SoftDeleteResult> {
    try {
      await this.db.run(
        `update capture_sources set deleted_at = ?, updated_at = ?, version = version + 1
         where id = ? and deleted_at is null`,
        [metadata.deletedAt as string, metadata.deletedAt as string, id],
      );
      return {
        id,
        deletedAt: metadata.deletedAt,
        version: asVersionNumber(1),
      };
    } catch (error) {
      throw wrapError('CaptureSource soft delete failed', error);
    }
  }
}

function wrapError(context: string, error: unknown): DatabaseError {
  if (error instanceof DatabaseError) return error;
  return new DatabaseError(`${context}: ${String(error)}`, { cause: error });
}
