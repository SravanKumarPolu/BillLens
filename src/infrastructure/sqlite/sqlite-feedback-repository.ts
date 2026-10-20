/**
 * SQLite-backed implementation of the `FeedbackRepository` and
 * `ReviewPromptLedger` ports — the on-device feedback store (Prompt 82).
 *
 * PRIVACY CONTRACT (see `feedback-repository.port.ts`): implementations
 * MUST only persist already-redacted feedback bodies. The use case
 * redacts before calling the port; this adapter re-redacts defensively
 * (`redactFeedbackBodyForType`) so an unsafe upstream caller cannot leak
 * PII into the local `feedback_records` table (added by migration 0004)
 * — the same double-redaction contract as `SqliteMetricRepository`.
 *
 * NPS USER LINKAGE: the `Feedback` entity deliberately carries NO user
 * identifier (privacy by design). NPS submissions follow the id
 * convention from `SubmitNpsSurveyUseCase` — `{userId}-nps-{epochMs}` —
 * so `findLatestNpsScore` / `findNpsSubmissions` use an EXACT id-prefix
 * match (`substr(id, 1, len) = prefix`, never LIKE — no wildcard
 * semantics, so user ids containing `%` or `_` cannot over-match).
 *
 * IDEMPOTENCY: `save` is idempotent by `id` — the table's primary key
 * enforces it at the storage layer, and the adapter implements the same
 * semantics with an upsert (a retry of the same feedback never
 * duplicates a row and never rewrites history with a DIFFERENT body:
 * an existing id keeps its first-write body).
 *
 * This is the LOCAL store only. The cloud feedback backend (cross-user
 * aggregation, support ticket creation) is deferred until the Supabase
 * project is provisioned — since persisted bodies are already redacted,
 * uploading them later requires no migration of this table.
 */

import type {
  FeedbackRepository,
  ReviewPromptLedger,
} from '@application/feedback/feedback-repository.port';
import { redactFeedbackBodyForType, type Feedback } from '@domain/feedback';

import type { DatabaseConnection, SqlRow } from './database-connection';

/** Exact id prefix that identifies a user's NPS submissions. */
function npsIdPrefix(userId: string): string {
  return `${userId}-nps-`;
}

export class SqliteFeedbackRepository implements FeedbackRepository, ReviewPromptLedger {
  constructor(private readonly db: DatabaseConnection) {}

  async save(feedback: Feedback): Promise<void> {
    // Defensive redaction — the port requires adapters to redact themselves.
    const redactedBody = redactFeedbackBodyForType(feedback.body, feedback.type);
    const ocrCorrectionJson =
      feedback.ocrCorrection !== undefined ? JSON.stringify(feedback.ocrCorrection) : null;

    await this.db.transaction(async (tx) => {
      const existing = await tx.get<SqlRow>(
        `select id from feedback_records where id = ?`,
        [feedback.id],
      );
      if (existing) {
        // Idempotent replay — first write wins; a retried submission with
        // the same id does NOT rewrite the stored body or metadata.
        return;
      }
      await tx.run(
        `insert into feedback_records
           (id, type, body, nps_score, nps_category, ocr_correction,
            app_version, platform, submitted_at, contact_opt_in)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          feedback.id,
          feedback.type,
          redactedBody,
          feedback.npsScore ?? null,
          feedback.npsCategory ?? null,
          ocrCorrectionJson,
          feedback.appVersion,
          feedback.platform,
          feedback.submittedAt,
          feedback.contactOptIn ? 1 : 0,
        ],
      );
    });
  }

  async findById(id: string): Promise<Feedback | null> {
    const row = await this.db.get<SqlRow>(
      `select id, type, body, nps_score, nps_category, ocr_correction,
              app_version, platform, submitted_at, contact_opt_in
       from feedback_records where id = ?`,
      [id],
    );
    return row !== null && row !== undefined ? mapFeedbackRow(row) : null;
  }

  async findLatestNpsScore(userId: string): Promise<number | null> {
    const prefix = npsIdPrefix(userId);
    const row = await this.db.get<SqlRow>(
      `select nps_score from feedback_records
       where type = 'nps' and substr(id, 1, ?) = ?
       order by submitted_at desc
       limit 1`,
      [prefix.length, prefix],
    );
    if (row === null || row === undefined) return null;
    const score = row['nps_score'];
    return typeof score === 'number' ? score : null;
  }

  async findNpsSubmissions(userId: string, limit: number): Promise<readonly Feedback[]> {
    const prefix = npsIdPrefix(userId);
    const rows = await this.db.all<SqlRow>(
      `select id, type, body, nps_score, nps_category, ocr_correction,
              app_version, platform, submitted_at, contact_opt_in
       from feedback_records
       where type = 'nps' and substr(id, 1, ?) = ?
       order by submitted_at desc
       limit ?`,
      [prefix.length, prefix, limit],
    );
    return rows.map(mapFeedbackRow);
  }

  // -------------------------------------------------------------------------
  // ReviewPromptLedger
  // -------------------------------------------------------------------------

  async recordPrompt(userId: string, promptedAt: string): Promise<void> {
    // Check-then-write upsert (same convention as SqliteMetricRepository)
    // rather than `ON CONFLICT ... DO UPDATE` so the behaviour is identical
    // on every engine, including the in-memory test double.
    await this.db.transaction(async (tx) => {
      const existing = await tx.get<SqlRow>(
        `select user_id from review_prompt_ledger where user_id = ?`,
        [userId],
      );
      if (existing) {
        await tx.run(
          `update review_prompt_ledger set last_prompted_at = ? where user_id = ?`,
          [promptedAt, userId],
        );
      } else {
        await tx.run(
          `insert into review_prompt_ledger (user_id, last_prompted_at) values (?, ?)`,
          [userId, promptedAt],
        );
      }
    });
  }

  async getLastPromptedAt(userId: string): Promise<string | null> {
    const row = await this.db.get<SqlRow>(
      `select last_prompted_at from review_prompt_ledger where user_id = ?`,
      [userId],
    );
    if (row === null || row === undefined) return null;
    const value = row['last_prompted_at'];
    return typeof value === 'string' ? value : null;
  }
}

function mapFeedbackRow(row: SqlRow): Feedback {
  const ocrRaw = row['ocr_correction'] as string | null | undefined;
  let ocrCorrection: Feedback['ocrCorrection'];
  if (ocrRaw !== null && ocrRaw !== undefined) {
    try {
      ocrCorrection = JSON.parse(ocrRaw) as Feedback['ocrCorrection'];
    } catch {
      // Corrupted correction JSON degrades to "no correction meta" —
      // never crash a read path over optional metadata.
    }
  }

  const npsScore = row['nps_score'];
  const npsCategory = row['nps_category'];

  return {
    id: row['id'] as string,
    type: row['type'] as Feedback['type'],
    body: row['body'] as string,
    ...(typeof npsScore === 'number'
      ? {
          npsScore,
          npsCategory: (npsCategory ?? undefined) as Feedback['npsCategory'],
        }
      : {}),
    ...(ocrCorrection !== undefined ? { ocrCorrection } : {}),
    appVersion: row['app_version'] as string,
    platform: row['platform'] as Feedback['platform'],
    submittedAt: row['submitted_at'] as string,
    contactOptIn: row['contact_opt_in'] === 1,
  };
}
