/**
 * SQLite-backed implementation of the `ExtractionResultRepository`
 * contract (capture intelligence layer persistence — v2.4.0).
 *
 * Storage layout (schema `extraction_results`): one row per extraction
 * run. The full `ExtractionResult` body (fields + line items + raw text)
 * is serialized to `extracted_data` JSON; the indexed/scalar columns
 * (`overall_confidence_bp`, `total_matches`, `raw_text`) are duplicated
 * from the body for queryability, exactly like the cloud schema's JSONB
 * approach.
 *
 * IMMUTABILITY: there is no update statement in this adapter — the only
 * write is `save` (insert). Re-running extraction creates a new row with
 * a new id; `findByCaptureSource` returns the latest one.
 */

import type { ExtractionResult } from '@domain/entities/extraction-result';
import type { ExtractionResultRepository } from '@domain/repositories/extraction-result.repository';
import type {
  DeleteMetadata,
  SoftDeleteResult,
} from '@domain/repositories/repository-contracts';
import { asDateTime, asVersionNumber, nowDateTime } from '@domain/value-objects';
import type { CaptureSourceId, ExtractionResultId } from '@shared-types/index';

import type { DatabaseConnection, SqlRow } from './database-connection';
import { DatabaseError } from './database-connection';
import { confidenceToBasisPoints } from './row-mappers';

interface ExtractionResultRow extends SqlRow {
  readonly id: string;
  readonly capture_source_id: string;
  readonly extracted_data: string;
  readonly overall_confidence_bp: number;
  readonly total_matches: number;
  readonly raw_text: string | null;
  readonly extracted_at: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
  readonly version: number;
}

/** Body persisted in `extracted_data` — everything except id/audit columns. */
interface ExtractionBody {
  readonly merchant: ExtractionResult['merchant'];
  readonly date: ExtractionResult['date'];
  readonly currencyCode: ExtractionResult['currencyCode'];
  readonly subtotal: ExtractionResult['subtotal'];
  readonly tax: ExtractionResult['tax'];
  readonly tip?: ExtractionResult['tip'];
  readonly total: ExtractionResult['total'];
  readonly lineItems: ExtractionResult['lineItems'];
  readonly overallConfidence: ExtractionResult['overallConfidence'];
  readonly totalMatches: boolean;
  readonly rawText?: string;
}

function mapExtractionRow(row: ExtractionResultRow): ExtractionResult {
  let body: ExtractionBody;
  try {
    body = JSON.parse(row.extracted_data) as ExtractionBody;
  } catch {
    throw new DatabaseError(
      `ExtractionResult ${row.id} has a corrupted extracted_data payload`,
      { code: 'CORRUPT_JSON' },
    );
  }
  return {
    id: row.id as never,
    captureSourceId: row.capture_source_id as never,
    merchant: body.merchant,
    date: body.date,
    currencyCode: body.currencyCode,
    subtotal: body.subtotal,
    tax: body.tax,
    ...(body.tip !== undefined ? { tip: body.tip } : {}),
    total: body.total,
    lineItems: body.lineItems,
    overallConfidence: body.overallConfidence,
    totalMatches: body.totalMatches,
    ...(row.raw_text !== null ? { rawText: row.raw_text } : {}),
    extractedAt: asDateTime(row.extracted_at),
    createdAt: asDateTime(row.created_at),
    version: asVersionNumber(row.version),
  };
}

export class SqliteExtractionResultRepository implements ExtractionResultRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async findById(id: ExtractionResultId): Promise<ExtractionResult | null> {
    const row = await this.db.get<ExtractionResultRow>(
      `select * from extraction_results where id = ? and deleted_at is null`,
      [id],
    );
    return row ? mapExtractionRow(row) : null;
  }

  /** Latest extraction for the capture source (re-runs produce new rows). */
  async findByCaptureSource(captureSourceId: CaptureSourceId): Promise<ExtractionResult | null> {
    const row = await this.db.get<ExtractionResultRow>(
      `select * from extraction_results
       where capture_source_id = ? and deleted_at is null
       order by extracted_at desc
       limit 1`,
      [captureSourceId],
    );
    return row ? mapExtractionRow(row) : null;
  }

  /**
   * Insert the immutable extraction result. A row with the same id is
   * treated as already-saved (idempotent replay — no update, no throw).
   */
  async save(result: ExtractionResult): Promise<void> {
    const body: ExtractionBody = {
      merchant: result.merchant,
      date: result.date,
      currencyCode: result.currencyCode,
      subtotal: result.subtotal,
      tax: result.tax,
      ...(result.tip !== undefined ? { tip: result.tip } : {}),
      total: result.total,
      lineItems: result.lineItems,
      overallConfidence: result.overallConfidence,
      totalMatches: result.totalMatches,
      ...(result.rawText !== undefined ? { rawText: result.rawText } : {}),
    };
    const now = nowDateTime();
    try {
      const existing = await this.db.get<SqlRow>(
        `select id from extraction_results where id = ?`,
        [result.id],
      );
      if (existing) return; // idempotent replay of the same immutable result
      await this.db.run(
        `insert into extraction_results (
           id, capture_source_id, extracted_data, overall_confidence_bp,
           total_matches, raw_text, extracted_at, created_at, updated_at,
           deleted_at, version, client_created_at, client_updated_at
         ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, ?, ?)`,
        [
          result.id,
          result.captureSourceId,
          JSON.stringify(body),
          confidenceToBasisPoints(result.overallConfidence),
          result.totalMatches ? 1 : 0,
          result.rawText ?? null,
          result.extractedAt as string,
          result.createdAt as string,
          result.createdAt as string,
          result.version,
          result.createdAt as string,
          now as string,
        ],
      );
    } catch (error) {
      throw new DatabaseError(`ExtractionResult save failed: ${String(error)}`, {
        cause: error,
      });
    }
  }

  async softDelete(id: ExtractionResultId, metadata: DeleteMetadata): Promise<SoftDeleteResult> {
    try {
      await this.db.run(
        `update extraction_results set deleted_at = ?, updated_at = ?, version = version + 1
         where id = ? and deleted_at is null`,
        [metadata.deletedAt as string, metadata.deletedAt as string, id],
      );
      return {
        id,
        deletedAt: metadata.deletedAt,
        version: asVersionNumber(1),
      };
    } catch (error) {
      throw new DatabaseError(`ExtractionResult soft delete failed: ${String(error)}`, {
        cause: error,
      });
    }
  }
}
