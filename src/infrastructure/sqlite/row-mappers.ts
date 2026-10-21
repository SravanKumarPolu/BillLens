/**
 * Shared SQLite row → domain-entity mappers and pagination helpers for
 * the write-side repository adapters.
 *
 * Every mapper is a pure function from a `SqlRow` (snake_case columns,
 * as stored by the local schema — see `schema.ts`) to the corresponding
 * domain entity (camelCase, branded value objects restored through the
 * domain `as*` constructors). The READ side (SqliteBalanceQueryPort)
 * performs its own inline mapping for its aggregate queries; these
 * helpers exist for the entity repositories so that write-side mapping
 * stays consistent across adapters without duplication.
 *
 * Conventions (mirroring the cloud schema and the local schema):
 *   - UUIDs / ids are TEXT.
 *   - Timestamps are ISO-8601 UTC TEXT; empty-string is never used —
 *     absence is always NULL.
 *   - Booleans are stored as 0/1 integers when a column requires it
 *     (none of the entity tables mapped here have boolean columns).
 *   - `client_created_at` / `client_updated_at` mirror the entity's
 *     `createdAt` / `updatedAt` (the local device is the source of
 *     truth for these until the cloud returns canonical timestamps).
 *   - `last_modified_by` defaults to `created_by` for local writes.
 */


import type { DraftCharge } from '@domain/entities/draft-charge';
import type { DraftLineItem } from '@domain/entities/draft-line-item';
import type { Expense } from '@domain/entities/expense';
import type {
  ExpenseDraft,
  DraftSource,
  DraftStatus,
} from '@domain/entities/expense-draft';
import type { ExpensePayer } from '@domain/entities/expense-payer';
import type { ExpenseSplit } from '@domain/entities/expense-split';
import type { FieldReviewIssue } from '@domain/entities/field-review-issue';
import type { Group } from '@domain/entities/group';
import type { GroupMember, MemberRole } from '@domain/entities/group-member';
import type {
  Settlement,
  SettlementDisputeReason,
  SettlementMethod,
} from '@domain/entities/settlement';
import type {
  PaginatedResult,
} from '@domain/repositories/repository-contracts';
import type {
  SettlementStateHistoryEntry,
} from '@domain/repositories/settlement.repository';
import type { BasisPoints } from '@domain/value-objects/basis-points';
import type { ExtractionConfidence } from '@domain/value-objects/extraction-confidence';
import {
  asCurrencyCode,
  asDateTime,
  asDisplayName,
  asExtractionConfidence,
  asVersionNumber,
} from '@domain/value-objects/index';
import type { ShareUnits } from '@domain/value-objects/share-units';
import type {
  CaptureSourceId,
  ExpenseDraftId,
  ExpenseId,
  GroupId,
  MemberId,
  ReceiptId,
  SettlementId,
  UserId,
} from '@shared-types/index';

import type { SqlRow } from './database-connection';

// ---------------------------------------------------------------------------
// Id generation
// ---------------------------------------------------------------------------

/**
 * Generate a storage-row id. Uses `crypto.randomUUID()` when available
 * (Hermes ≥ 0.74 exposes it; jest environments do), falling back to a
 * timestamp + random string. This is the same fallback shape previously
 * used by `SqliteSyncRepository` (now shared here so every adapter
 * generates ids identically).
 */
export function newRowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Pagination (numeric-offset cursor convention)
// ---------------------------------------------------------------------------

/**
 * Paginate a row list using the numeric-offset cursor convention already
 * established by the application-layer in-memory repositories
 * (`cursor` = "skip count", `nextCursor` = offset of the next page).
 *
 * The repositories fetch `limit + 1` rows starting at `offset`; the
 * extra row answers `hasMore` without a second COUNT query. An empty
 * page is returned when the cursor points past the end (the slice is
 * simply empty and `hasMore` is false).
 */
export function paginateRows<T>(
  fetched: readonly T[],
  limit: number,
  offset: number,
): PaginatedResult<T> {
  const hasMore = fetched.length > limit;
  const items = hasMore ? fetched.slice(0, limit) : fetched;
  return {
    items,
    nextCursor: hasMore ? String(offset + limit) : undefined,
    hasMore,
  };
}

/** Parse a numeric-offset cursor; invalid or negative values clamp to 0. */
export function parseOffsetCursor(cursor?: string): number {
  if (!cursor) return 0;
  const parsed = Number.parseInt(cursor, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

// ---------------------------------------------------------------------------
// groups
// ---------------------------------------------------------------------------

export function mapGroupRow(row: SqlRow): Group {
  return {
    id: row['id'] as GroupId,
    name: row['name'] as string,
    ...(row['description'] !== null && row['description'] !== undefined
      ? { description: row['description'] as string }
      : {}),
    ...(row['category'] !== null && row['category'] !== undefined
      ? { category: row['category'] as Group['category'] }
      : {}),
    ...(row['icon'] !== null && row['icon'] !== undefined ? { icon: row['icon'] as string } : {}),
    ...(row['archived_at'] !== null && row['archived_at'] !== undefined
      ? { archivedAt: asDateTime(row['archived_at'] as string) }
      : {}),
    currencyCode: asCurrencyCode(row['currency_code'] as string),
    createdBy: row['created_by'] as UserId,
    createdAt: asDateTime(row['created_at'] as string),
    updatedAt: asDateTime(row['updated_at'] as string),
    ...(row['deleted_at'] !== null && row['deleted_at'] !== undefined
      ? { deletedAt: asDateTime(row['deleted_at'] as string) }
      : {}),
    version: asVersionNumber(row['version'] as number),
  };
}

// ---------------------------------------------------------------------------
// group_members
// ---------------------------------------------------------------------------

export function mapGroupMemberRow(row: SqlRow): GroupMember {
  return {
    id: row['id'] as MemberId,
    groupId: row['group_id'] as GroupId,
    ...(row['user_id'] !== null && row['user_id'] !== undefined
      ? { userId: row['user_id'] as UserId }
      : {}),
    displayName: asDisplayName(row['display_name'] as string),
    role: row['role'] as MemberRole,
    joinedAt: asDateTime(row['joined_at'] as string),
    updatedAt: asDateTime(row['updated_at'] as string),
    ...(row['left_at'] !== null && row['left_at'] !== undefined
      ? { leftAt: asDateTime(row['left_at'] as string) }
      : {}),
    version: asVersionNumber(row['version'] as number),
  };
}

// ---------------------------------------------------------------------------
// expenses / expense_payers / expense_splits
// ---------------------------------------------------------------------------

function parseOptionalJsonArray<T>(value: unknown): readonly T[] | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : undefined;
  } catch {
    return undefined;
  }
}

export function mapExpenseRow(row: SqlRow): Expense {
  return {
    id: row['id'] as ExpenseId,
    groupId: row['group_id'] as GroupId,
    title: row['title'] as string,
    amountMinor: row['amount_minor'] as number,
    currencyCode: asCurrencyCode(row['currency_code'] as string),
    expenseDate: asDateTime(row['expense_date'] as string),
    splitType: row['split_type'] as Expense['splitType'],
    ...(row['receipt_id'] !== null && row['receipt_id'] !== undefined
      ? { receiptId: row['receipt_id'] as Expense['receiptId'] }
      : {}),
    ...(row['note'] !== null && row['note'] !== undefined
      ? { note: row['note'] as string }
      : {}),
    ...(row['category'] !== null && row['category'] !== undefined
      ? { category: row['category'] as string }
      : {}),
    ...(parseOptionalJsonArray<NonNullable<Expense['lineItems']>[number]>(
      row['line_items_json'],
    ) !== undefined
      ? {
          lineItems: parseOptionalJsonArray<NonNullable<Expense['lineItems']>[number]>(
            row['line_items_json'],
          ),
        }
      : {}),
    ...(parseOptionalJsonArray<NonNullable<Expense['itemCharges']>[number]>(
      row['item_charges_json'],
    ) !== undefined
      ? {
          itemCharges: parseOptionalJsonArray<NonNullable<Expense['itemCharges']>[number]>(
            row['item_charges_json'],
          ),
        }
      : {}),
    createdBy: row['created_by'] as UserId,
    createdAt: asDateTime(row['created_at'] as string),
    updatedAt: asDateTime(row['updated_at'] as string),
    ...(row['deleted_at'] !== null && row['deleted_at'] !== undefined
      ? { deletedAt: asDateTime(row['deleted_at'] as string) }
      : {}),
    version: asVersionNumber(row['version'] as number),
  };
}

export function mapExpensePayerRow(row: SqlRow, expenseId: ExpenseId): ExpensePayer {
  return {
    id: row['id'] as ExpensePayer['id'],
    expenseId,
    memberId: row['member_id'] as MemberId,
    amountMinor: row['amount_minor'] as number,
    createdAt: asDateTime(row['created_at'] as string),
    updatedAt: asDateTime(row['updated_at'] as string),
    ...(row['deleted_at'] !== null && row['deleted_at'] !== undefined
      ? { deletedAt: asDateTime(row['deleted_at'] as string) }
      : {}),
    version: asVersionNumber(row['version'] as number),
  };
}

export function mapExpenseSplitRow(row: SqlRow, expenseId: ExpenseId): ExpenseSplit {
  return {
    id: row['id'] as ExpenseSplit['id'],
    expenseId,
    memberId: row['member_id'] as MemberId,
    amountMinor: row['amount_minor'] as number,
    ...(row['percentage_basis_points'] !== null &&
    row['percentage_basis_points'] !== undefined
      ? { percentageBasisPoints: row['percentage_basis_points'] as BasisPoints }
      : {}),
    ...(row['share_units'] !== null && row['share_units'] !== undefined
      ? { shareUnits: row['share_units'] as ShareUnits }
      : {}),
    createdAt: asDateTime(row['created_at'] as string),
    updatedAt: asDateTime(row['updated_at'] as string),
    ...(row['deleted_at'] !== null && row['deleted_at'] !== undefined
      ? { deletedAt: asDateTime(row['deleted_at'] as string) }
      : {}),
    version: asVersionNumber(row['version'] as number),
  };
}

// ---------------------------------------------------------------------------
// settlements / settlement_state_history
// ---------------------------------------------------------------------------

/**
 * Optional-column helper: return the stored value ONLY when it is present
 * (non-null), otherwise omit the key so the entity field stays `undefined`
 * — the same convention every other mapper in this file follows.
 */
function optional(row: SqlRow, key: string): unknown | undefined {
  const value = row[key];
  return value === null || value === undefined ? undefined : value;
}

/**
 * Map a `settlements` row to the `Settlement` entity.
 *
 * `status` is NULL only for rows written before the Phase 6 Track 1
 * migration; the domain treats a missing `status` as `'completed'`
 * (see `isSettlementCompleted`), so the mapper may omit it entirely —
 * hydrating `undefined` keeps that backwards-compatible path alive.
 */
export function mapSettlementRow(row: SqlRow): Settlement {
  return {
    id: row['id'] as SettlementId,
    groupId: row['group_id'] as GroupId,
    fromMemberId: row['from_member_id'] as MemberId,
    toMemberId: row['to_member_id'] as MemberId,
    amountMinor: row['amount_minor'] as number,
    currencyCode: asCurrencyCode(row['currency_code'] as string),
    method: row['method'] as SettlementMethod,
    settlementDate: asDateTime(row['settlement_date'] as string),
    ...(optional(row, 'note') !== undefined ? { note: row['note'] as string } : {}),
    createdBy: row['created_by'] as UserId,
    createdAt: asDateTime(row['created_at'] as string),
    updatedAt: asDateTime(row['updated_at'] as string),
    ...(optional(row, 'deleted_at') !== undefined
      ? { deletedAt: asDateTime(row['deleted_at'] as string) }
      : {}),
    version: asVersionNumber(row['version'] as number),
    ...(optional(row, 'reverses_settlement_id') !== undefined
      ? { reversesSettlementId: row['reverses_settlement_id'] as SettlementId }
      : {}),
    ...(optional(row, 'reversal_of_settlement_id') !== undefined
      ? { reversalOfSettlementId: row['reversal_of_settlement_id'] as SettlementId }
      : {}),
    ...(optional(row, 'status') !== undefined
      ? { status: row['status'] as Settlement['status'] }
      : {}),
    ...(optional(row, 'confirmed_by_member_id') !== undefined
      ? { confirmedByMemberId: row['confirmed_by_member_id'] as MemberId }
      : {}),
    ...(optional(row, 'confirmed_at') !== undefined
      ? { confirmedAt: asDateTime(row['confirmed_at'] as string) }
      : {}),
    ...(optional(row, 'payment_reference_hash') !== undefined
      ? { paymentReferenceHash: row['payment_reference_hash'] as string }
      : {}),
    ...(optional(row, 'operation_id') !== undefined
      ? { operationId: row['operation_id'] as string }
      : {}),
    ...(optional(row, 'evidence_hash') !== undefined
      ? { evidenceHash: row['evidence_hash'] as string }
      : {}),
    ...(optional(row, 'dispute_reason') !== undefined
      ? { disputeReason: row['dispute_reason'] as SettlementDisputeReason }
      : {}),
    ...(optional(row, 'dispute_note') !== undefined
      ? { disputeNote: row['dispute_note'] as string }
      : {}),
  };
}

/** Map a `settlement_state_history` row to its repository DTO. */
export function mapSettlementStateHistoryRow(row: SqlRow): SettlementStateHistoryEntry {
  return {
    id: row['id'] as string,
    settlementId: row['settlement_id'] as SettlementId,
    fromStatus: row['from_status'] as NonNullable<Settlement['status']>,
    toStatus: row['to_status'] as NonNullable<Settlement['status']>,
    ...(optional(row, 'actor_id') !== undefined
      ? { actorId: row['actor_id'] as UserId }
      : {}),
    ...(optional(row, 'actor_member_id') !== undefined
      ? { actorMemberId: row['actor_member_id'] as MemberId }
      : {}),
    ...(optional(row, 'note') !== undefined ? { note: row['note'] as string } : {}),
    newVersion: row['new_version'] as number,
    createdAt: asDateTime(row['created_at'] as string),
  };
}

// ---------------------------------------------------------------------------
// expense_drafts
// ---------------------------------------------------------------------------

/**
 * The flexible part of a draft, stored as the `draft_data` JSON column.
 * Fixed columns (id, group_id, source, capture_source_id,
 * extraction_result_id, status, overall_confidence_bp,
 * unresolved_issues, confirmed_expense_id, confirmed_receipt_id and the
 * audit columns) are stored relationally; everything the capture UI
 * edits freely lives here.
 */
export interface DraftDataJson {
  readonly title?: string;
  readonly amountMinor?: number;
  readonly currencyCode?: string;
  readonly merchantName?: string;
  readonly expenseDate?: string;
  readonly payerCandidates: readonly MemberId[];
  readonly participantCandidates: readonly MemberId[];
  readonly lineItems: readonly DraftLineItem[];
  readonly charges: readonly DraftCharge[];
}

export function serializeDraftData(draft: {
  readonly title?: string;
  readonly amountMinor?: number;
  readonly currencyCode?: string;
  readonly merchantName?: string;
  readonly expenseDate?: string;
  readonly payerCandidates: readonly MemberId[];
  readonly participantCandidates: readonly MemberId[];
  readonly lineItems: readonly DraftLineItem[];
  readonly charges: readonly DraftCharge[];
}): string {
  const data: Record<string, unknown> = {
    payerCandidates: [...draft.payerCandidates],
    participantCandidates: [...draft.participantCandidates],
    lineItems: [...draft.lineItems],
    charges: [...draft.charges],
  };
  if (draft.title !== undefined) data['title'] = draft.title;
  if (draft.amountMinor !== undefined) data['amountMinor'] = draft.amountMinor;
  if (draft.currencyCode !== undefined) data['currencyCode'] = draft.currencyCode;
  if (draft.merchantName !== undefined) data['merchantName'] = draft.merchantName;
  if (draft.expenseDate !== undefined) data['expenseDate'] = draft.expenseDate;
  return JSON.stringify(data);
}

export function mapDraftRow(row: SqlRow): ExpenseDraft {
  const data = parseDraftData(row['draft_data'] as string | null);
  const confidenceBp = row['overall_confidence_bp'] as number | null;
  const issues = parseJsonArray<FieldReviewIssue>(row['unresolved_issues'] as string | null);

  return {
    id: row['id'] as ExpenseDraftId,
    ...(row['group_id'] !== null && row['group_id'] !== undefined
      ? { groupId: row['group_id'] as GroupId }
      : {}),
    source: row['source'] as DraftSource,
    ...(row['capture_source_id'] !== null && row['capture_source_id'] !== undefined
      ? { captureSourceId: row['capture_source_id'] as CaptureSourceId }
      : {}),
    ...(row['extraction_result_id'] !== null && row['extraction_result_id'] !== undefined
      ? { extractionResultId: row['extraction_result_id'] as string }
      : {}),
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...(data.amountMinor !== undefined ? { amountMinor: data.amountMinor } : {}),
    ...(data.currencyCode !== undefined
      ? { currencyCode: asCurrencyCode(data.currencyCode) }
      : {}),
    ...(data.merchantName !== undefined ? { merchantName: data.merchantName } : {}),
    ...(data.expenseDate !== undefined ? { expenseDate: data.expenseDate } : {}),
    payerCandidates: data.payerCandidates,
    participantCandidates: data.participantCandidates,
    lineItems: data.lineItems,
    charges: data.charges,
    ...(confidenceBp !== null && confidenceBp !== undefined
      ? { overallConfidence: asExtractionConfidence(confidenceBp / 10000) }
      : {}),
    unresolvedIssues: issues,
    status: row['status'] as DraftStatus,
    ...(row['confirmed_expense_id'] !== null && row['confirmed_expense_id'] !== undefined
      ? { confirmedExpenseId: row['confirmed_expense_id'] as ExpenseId }
      : {}),
    ...(row['confirmed_receipt_id'] !== null && row['confirmed_receipt_id'] !== undefined
      ? { confirmedReceiptId: row['confirmed_receipt_id'] as ReceiptId }
      : {}),
    createdBy: row['created_by'] as UserId,
    createdAt: asDateTime(row['created_at'] as string),
    updatedAt: asDateTime(row['updated_at'] as string),
    version: row['version'] as number,
  };
}

/** Convert a 0–1 confidence to the integer basis-points storage format. */
export function confidenceToBasisPoints(confidence: ExtractionConfidence): number {
  return Math.round(confidence * 10000);
}

function parseDraftData(raw: string | null): DraftDataJson {
  if (!raw) {
    return { payerCandidates: [], participantCandidates: [], lineItems: [], charges: [] };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<DraftDataJson> | null;
    return {
      ...(parsed?.title !== undefined ? { title: parsed.title } : {}),
      ...(parsed?.amountMinor !== undefined ? { amountMinor: parsed.amountMinor } : {}),
      ...(parsed?.currencyCode !== undefined ? { currencyCode: parsed.currencyCode } : {}),
      ...(parsed?.merchantName !== undefined ? { merchantName: parsed.merchantName } : {}),
      ...(parsed?.expenseDate !== undefined ? { expenseDate: parsed.expenseDate } : {}),
      payerCandidates: parsed?.payerCandidates ?? [],
      participantCandidates: parsed?.participantCandidates ?? [],
      lineItems: parsed?.lineItems ?? [],
      charges: parsed?.charges ?? [],
    };
  } catch {
    // Corrupted JSON must never crash a read — degrade to an empty draft
    // body (the fixed columns still round-trip).
    return { payerCandidates: [], participantCandidates: [], lineItems: [], charges: [] };
  }
}

function parseJsonArray<T>(raw: string | null): readonly T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

// Re-exported for repository implementations (keeps their import lists short).
export type { DraftLineItem, DraftCharge, FieldReviewIssue };
