import type { DateTime } from '@domain/value-objects';
import { nowDateTime } from '@domain/value-objects';

import type { DatabaseConnection } from '../sqlite/database-connection';

/**
 * Draft recovery service.
 *
 * On app launch, this service finds:
 *   1. Capture sources stuck in 'processing' status (OCR was interrupted)
 *   2. Expense drafts in 'capturing' or 'processing' status (the capture
 *      or extraction pipeline was interrupted before the draft reached
 *      'needs_review')
 *
 * These are reset to 'needs_review' so the user can review what was
 * captured so far, retry, or discard. We never auto-advance a stuck
 * draft to 'confirmed' — that would bypass user review.
 */

export interface DraftRecoveryResult {
  readonly stuckCaptureSources: number;
  readonly stuckDrafts: number;
  readonly recoveredAt: DateTime;
}

export async function recoverInterruptedDrafts(
  db: DatabaseConnection,
): Promise<DraftRecoveryResult> {
  const now = nowDateTime();
  let stuckCaptureSources = 0;
  let stuckDrafts = 0;

  // Reset capture sources stuck in 'processing' to 'pending'
  const captureResult = await db.run(
    `update capture_sources set processing_status = 'pending', updated_at = ?
     where processing_status = 'processing'`,
    [now as string],
  );
  stuckCaptureSources = captureResult.rowsAffected;

  // Reset expense drafts stuck in 'capturing' OR 'processing' to 'needs_review'.
  // Both states precede user review in the state machine
  //   capturing → processing → needs_review → confirmed (or discarded)
  // and either may be left dangling if the app crashed mid-extraction.
  // The user will see the draft in 'needs_review' and can either complete
  // the missing fields manually, re-run capture, or discard.
  const draftResult = await db.run(
    `update expense_drafts set status = 'needs_review', updated_at = ?
     where status in ('capturing', 'processing')`,
    [now as string],
  );
  stuckDrafts = draftResult.rowsAffected;

  return { stuckCaptureSources, stuckDrafts, recoveredAt: now };
}

/**
 * Prevent duplicate scan operations.
 * Checks if a capture source with the same image hash already exists
 * and is not soft-deleted.
 */
export async function checkDuplicateScan(
  db: DatabaseConnection,
  imageHash: string,
): Promise<{ isDuplicate: boolean; existingId?: string }> {
  const row = await db.get<{ id: string }>(
    `select id from capture_sources where image_hash = ? and deleted_at is null limit 1`,
    [imageHash],
  );
  if (row) {
    return { isDuplicate: true, existingId: row.id };
  }
  return { isDuplicate: false };
}
