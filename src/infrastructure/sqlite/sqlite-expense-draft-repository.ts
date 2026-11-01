/**
 * SQLite-backed implementation of the `ExpenseDraftRepository` contract
 * (capture intelligence layer persistence).
 *
 * Storage layout (schema `expense_drafts`):
 *   - Fixed relational columns: identity, group, source, lifecycle
 *     status, confidence (basis points), confirmed links, audit columns.
 *   - `draft_data` (JSON TEXT): the freely-edited body — title, amount,
 *     currency, merchant, date, payer/participant candidates, line
 *     items, charges. See `DraftDataJson` in row-mappers.ts.
 *   - `unresolved_issues` (JSON TEXT): the FieldReviewIssue array.
 *
 * SYNC NOTE: drafts are intentionally NOT enqueued to the offline sync
 * queue. `SyncEntityType` has no `expense_draft` member — capture-layer
 * artifacts stay local-only until the cloud schema grows the matching
 * tables (documented in IMPLEMENTATION_STATUS.md). The HARD RULE from
 * the contract holds by construction here: saving a draft writes ONLY
 * the `expense_drafts` row — never expenses, payers, or splits.
 */


import type { ExpenseDraft } from '@domain/entities/expense-draft';
import type { ExpenseDraftRepository } from '@domain/repositories/expense-draft.repository';
import type {
  DeleteMetadata,
  PaginatedResult,
  Pagination,
  SoftDeleteResult,
} from '@domain/repositories/repository-contracts';
import { asDateTime, asVersionNumber } from '@domain/value-objects';
import type { DateTime } from '@domain/value-objects/date-time';
import type { ExpenseDraftId, GroupId } from '@shared-types/index';

import type { DatabaseConnection, SqlRow } from './database-connection';
import { DatabaseError } from './database-connection';
import {
  confidenceToBasisPoints,
  mapDraftRow,
  paginateRows,
  parseOffsetCursor,
  serializeDraftData,
} from './row-mappers';

const DRAFT_COLUMNS = `
  id, group_id, source, capture_source_id, extraction_result_id, draft_data,
  status, overall_confidence_bp, unresolved_issues, confirmed_expense_id,
  confirmed_receipt_id, created_by, created_at, updated_at, deleted_at, version
`;

export class SqliteExpenseDraftRepository implements ExpenseDraftRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async findById(id: ExpenseDraftId): Promise<ExpenseDraft | null> {
    const row = await this.db.get<SqlRow>(
      `select ${DRAFT_COLUMNS} from expense_drafts where id = ?`,
      [id],
    );
    return row ? mapDraftRow(row) : null;
  }

  async listByGroup(
    groupId: GroupId,
    pagination: Pagination,
  ): Promise<PaginatedResult<ExpenseDraft>> {
    const offset = parseOffsetCursor(pagination.cursor);
    const rows = await this.db.all<SqlRow>(
      `select ${DRAFT_COLUMNS} from expense_drafts
       where group_id = ? and deleted_at is null
       order by updated_at desc
       limit ? offset ?`,
      [groupId, pagination.limit + 1, offset],
    );
    return paginateRows(rows.map(mapDraftRow), pagination.limit, offset);
  }

  async listByStatus(
    status: ExpenseDraft['status'],
    pagination: Pagination,
  ): Promise<PaginatedResult<ExpenseDraft>> {
    const offset = parseOffsetCursor(pagination.cursor);
    const rows = await this.db.all<SqlRow>(
      `select ${DRAFT_COLUMNS} from expense_drafts
       where status = ? and deleted_at is null
       order by updated_at desc
       limit ? offset ?`,
      [status, pagination.limit + 1, offset],
    );
    return paginateRows(rows.map(mapDraftRow), pagination.limit, offset);
  }

  async listByCaptureSource(captureSourceId: string): Promise<readonly ExpenseDraft[]> {
    const rows = await this.db.all<SqlRow>(
      `select ${DRAFT_COLUMNS} from expense_drafts
       where capture_source_id = ? and deleted_at is null
       order by created_at asc`,
      [captureSourceId],
    );
    return rows.map(mapDraftRow);
  }

  async listUpdatedSince(
    groupId: GroupId,
    since: DateTime,
    pagination: Pagination,
  ): Promise<PaginatedResult<ExpenseDraft>> {
    const offset = parseOffsetCursor(pagination.cursor);
    const rows = await this.db.all<SqlRow>(
      `select ${DRAFT_COLUMNS} from expense_drafts
       where group_id = ? and updated_at > ?
       order by updated_at asc
       limit ? offset ?`,
      [groupId, since as string, pagination.limit + 1, offset],
    );
    return paginateRows(rows.map(mapDraftRow), pagination.limit, offset);
  }

  async save(draft: ExpenseDraft): Promise<void> {
    const draftData = serializeDraftData(draft);
    const issuesJson = JSON.stringify(draft.unresolvedIssues ?? []);
    const confidenceBp =
      draft.overallConfidence !== undefined
        ? confidenceToBasisPoints(draft.overallConfidence)
        : null;

    await this.db.transaction(async (tx) => {
      const existing = await tx.get<SqlRow>(
        `select id from expense_drafts where id = ?`,
        [draft.id],
      );
      if (existing) {
        await tx.run(
          `update expense_drafts set
             group_id = ?, source = ?, capture_source_id = ?,
             extraction_result_id = ?, draft_data = ?, status = ?,
             overall_confidence_bp = ?, unresolved_issues = ?,
             confirmed_expense_id = ?, confirmed_receipt_id = ?,
             created_by = ?, created_at = ?, updated_at = ?, deleted_at = null,
             version = ?
           where id = ?`,
          [
            draft.groupId ?? null,
            draft.source,
            draft.captureSourceId ?? null,
            draft.extractionResultId ?? null,
            draftData,
            draft.status,
            confidenceBp,
            issuesJson,
            draft.confirmedExpenseId ?? null,
            draft.confirmedReceiptId ?? null,
            draft.createdBy,
            draft.createdAt as string,
            draft.updatedAt as string,
            draft.version,
            draft.id,
          ],
        );
      } else {
        await tx.run(
          `insert into expense_drafts (
             id, group_id, source, capture_source_id, extraction_result_id,
             draft_data, status, overall_confidence_bp, unresolved_issues,
             confirmed_expense_id, confirmed_receipt_id, created_by,
             created_at, updated_at, deleted_at, version
           ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            draft.id,
            draft.groupId ?? null,
            draft.source,
            draft.captureSourceId ?? null,
            draft.extractionResultId ?? null,
            draftData,
            draft.status,
            confidenceBp,
            issuesJson,
            draft.confirmedExpenseId ?? null,
            draft.confirmedReceiptId ?? null,
            draft.createdBy,
            draft.createdAt as string,
            draft.updatedAt as string,
            // The entity cannot express a tombstone — deletes go through
            // softDelete() only, so a fresh insert is always active.
            null,
            draft.version,
          ],
        );
      }
    });
  }

  async softDelete(id: ExpenseDraftId, metadata: DeleteMetadata): Promise<SoftDeleteResult> {
    return this.db.transaction(async (tx) => {
      const row = await tx.get<SqlRow>(
        `select ${DRAFT_COLUMNS} from expense_drafts where id = ?`,
        [id],
      );
      if (!row) {
        throw new DatabaseError(`ExpenseDraft ${id} not found`, { code: 'NOT_FOUND' });
      }
      const currentDeletedAt = row['deleted_at'] as string | null;
      if (currentDeletedAt) {
        // Idempotent replay.
        return {
          id: id as string,
          deletedAt: asDateTime(currentDeletedAt),
          version: asVersionNumber(row['version'] as number),
        };
      }
      const deletedAt = metadata.deletedAt;
      const newVersion = asVersionNumber((row['version'] as number) + 1);
      await tx.run(
        `update expense_drafts set deleted_at = ?, updated_at = ?, version = ? where id = ?`,
        [deletedAt as string, deletedAt as string, newVersion as number, id],
      );
      return { id: id as string, deletedAt, version: newVersion };
    });
  }
}
