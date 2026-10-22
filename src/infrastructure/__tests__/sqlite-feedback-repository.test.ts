import { beforeEach, describe, expect, it } from '@jest/globals';

import {
  PromptAppStoreReviewUseCase,
  SubmitFeedbackUseCase,
  SubmitNpsSurveyUseCase,
  isEligibleForNps,
} from '@application/feedback/index';

import { runMigrations, getSchemaVersion } from '../sqlite/schema';
import { SqliteFeedbackRepository } from '../sqlite/sqlite-feedback-repository';

import { InMemoryDatabase } from './in-memory-database';

/**
 * SQLite feedback repository tests (Prompt 82 infrastructure).
 *
 * Proves:
 *   1. Migration 0004 creates feedback_records + review_prompt_ledger and
 *      bumps the schema version through 6 (v2.5.0 sync_queue_alignment applied after).
 *   2. save → findById round-trips every field (incl. NPS score/category
 *      and OCR correction metadata).
 *   3. save is IDEMPOTENT by id — first write wins, no duplicate rows.
 *   4. The adapter redacts bodies DEFENSIVELY (PII never reaches the
 *      table even when the caller bypassed the use case).
 *   5. NPS user linkage follows the {userId}-nps-{epoch} id convention
 *      with EXACT prefix matching (no LIKE wildcard semantics).
 *   6. The ReviewPromptLedger round-trips and upserts.
 *   7. All three feedback use cases execute over the real adapter —
 *      the composition-root wiring's building blocks — including the
 *      NPS cooldown read-back and the review-prompt ledger write.
 */

const NOW = '2026-10-11T10:00:00.000Z';
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

let db: InMemoryDatabase;
let repo: SqliteFeedbackRepository;

beforeEach(async () => {
  db = new InMemoryDatabase();
  await runMigrations(db);
  repo = new SqliteFeedbackRepository(db);
});

describe('migration 0004 (feedback store)', () => {
  it('creates both tables and bumps the schema version through 6 (v2.5.0 sync_queue_alignment applied after)', async () => {
    expect(await getSchemaVersion(db)).toBe(12);
    expect(db.hasTable('feedback_records')).toBe(true);
    expect(db.hasTable('review_prompt_ledger')).toBe(true);
  });

  it('is idempotent when migrations run twice', async () => {
    await expect(runMigrations(db)).resolves.not.toThrow();
    expect(await getSchemaVersion(db)).toBe(12);
  });
});

describe('sqlite feedback repository', () => {
  it('round-trips a general feedback record with every field', async () => {
    await repo.save({
      id: 'fb-1',
      type: 'feature_request',
      body: 'Please add recurring expenses.',
      appVersion: '2.1.0',
      platform: 'android',
      submittedAt: NOW,
      contactOptIn: true,
    });

    const loaded = await repo.findById('fb-1');
    expect(loaded).not.toBeNull();
    expect(loaded?.type).toBe('feature_request');
    expect(loaded?.body).toBe('Please add recurring expenses.');
    expect(loaded?.appVersion).toBe('2.1.0');
    expect(loaded?.platform).toBe('android');
    expect(loaded?.submittedAt).toBe(NOW);
    expect(loaded?.contactOptIn).toBe(true);
    expect(loaded?.npsScore).toBeUndefined();
    expect(loaded?.ocrCorrection).toBeUndefined();
  });

  it('round-trips NPS score, category, and OCR correction metadata', async () => {
    await repo.save({
      id: `${USER_A}-nps-${Date.parse(NOW)}`,
      type: 'nps',
      body: '',
      npsScore: 9,
      npsCategory: 'promoter',
      appVersion: '2.1.0',
      platform: 'ios',
      submittedAt: NOW,
      contactOptIn: false,
    });
    await repo.save({
      id: 'fb-ocr-1',
      type: 'ocr_correction',
      body: 'Corrected the total field.',
      ocrCorrection: {
        fieldCorrections: { total: 3, merchant: 1 },
        acceptedFieldCount: 7,
        correctedFieldCount: 4,
      },
      appVersion: '2.1.0',
      platform: 'web',
      submittedAt: NOW,
      contactOptIn: false,
    });

    const nps = await repo.findById(`${USER_A}-nps-${Date.parse(NOW)}`);
    expect(nps?.npsScore).toBe(9);
    expect(nps?.npsCategory).toBe('promoter');

    const ocr = await repo.findById('fb-ocr-1');
    expect(ocr?.ocrCorrection).toEqual({
      fieldCorrections: { total: 3, merchant: 1 },
      acceptedFieldCount: 7,
      correctedFieldCount: 4,
    });
  });

  it('save is idempotent by id — first write wins, no duplicates', async () => {
    await repo.save({
      id: 'fb-1',
      type: 'general',
      body: 'First version.',
      appVersion: '2.1.0',
      platform: 'ios',
      submittedAt: NOW,
      contactOptIn: false,
    });
    // A retry with the same id must NOT rewrite the stored body.
    await repo.save({
      id: 'fb-1',
      type: 'general',
      body: 'Second version (retry).',
      appVersion: '2.1.0',
      platform: 'ios',
      submittedAt: NOW,
      contactOptIn: false,
    });

    const rows = await db.all<{ count: number }>(
      'select count(*) as count from feedback_records',
    );
    expect(rows[0]?.count).toBe(1);
    expect((await repo.findById('fb-1'))?.body).toBe('First version.');
  });

  it('redacts unsafe bodies defensively before persisting', async () => {
    // The use case normally redacts BEFORE save; this call bypasses it on
    // purpose to prove the adapter's defense-in-depth contract.
    await repo.save({
      id: 'fb-unsafe-1',
      type: 'bug_report',
      body: 'Crashed after I paid alice@example.com via alice@okhdfcbank — screenshot at file:///var/mobile/Containers/receipt.jpg',
      appVersion: '2.1.0',
      platform: 'ios',
      submittedAt: NOW,
      contactOptIn: false,
    });

    const raw = await db.all<{ body: string }>('select body from feedback_records');
    const stored = String(raw[0]?.body);
    expect(stored).not.toContain('alice@example.com');
    expect(stored).not.toContain('alice@okhdfcbank');
    expect(stored).not.toContain('receipt.jpg');
    expect(stored).not.toContain('file://');
  });

  it('findLatestNpsScore / findNpsSubmissions follow the id-prefix convention', async () => {
    const t1 = '2026-07-01T10:00:00.000Z';
    const t2 = '2026-08-01T10:00:00.000Z';
    const t3 = '2026-09-01T10:00:00.000Z';

    await repo.save({
      id: `${USER_A}-nps-${Date.parse(t1)}`,
      type: 'nps',
      body: '',
      npsScore: 5,
      npsCategory: 'detractor',
      appVersion: '2.1.0',
      platform: 'ios',
      submittedAt: t1,
      contactOptIn: false,
    });
    await repo.save({
      id: `${USER_A}-nps-${Date.parse(t3)}`,
      type: 'nps',
      body: '',
      npsScore: 10,
      npsCategory: 'promoter',
      appVersion: '2.1.0',
      platform: 'ios',
      submittedAt: t3,
      contactOptIn: false,
    });
    await repo.save({
      id: `${USER_B}-nps-${Date.parse(t2)}`,
      type: 'nps',
      body: '',
      npsScore: 7,
      npsCategory: 'passive',
      appVersion: '2.1.0',
      platform: 'android',
      submittedAt: t2,
      contactOptIn: false,
    });
    // A non-NPS record that happens to share the prefix shape must not match.
    await repo.save({
      id: `${USER_A}-nps-not-a-survey`,
      type: 'general',
      body: 'Prefix collision probe.',
      appVersion: '2.1.0',
      platform: 'ios',
      submittedAt: t2,
      contactOptIn: false,
    });

    expect(await repo.findLatestNpsScore(USER_A)).toBe(10);
    expect(await repo.findLatestNpsScore(USER_B)).toBe(7);
    expect(await repo.findLatestNpsScore('33333333-3333-4333-8333-333333333333')).toBeNull();

    const submissionsA = await repo.findNpsSubmissions(USER_A, 10);
    expect(submissionsA).toHaveLength(2);
    // Newest-first ordering.
    expect(submissionsA[0]?.npsScore).toBe(10);
    expect(submissionsA[1]?.npsScore).toBe(5);
  });

  it('corrupted OCR correction JSON degrades to undefined instead of crashing', async () => {
    await db.run(
      `insert into feedback_records (id, type, body, ocr_correction, app_version, platform, submitted_at, contact_opt_in)
       values (?, ?, ?, ?, ?, ?, ?, 0)`,
      ['fb-badjson', 'ocr_correction', 'x', '{not valid json', '2.1.0', 'ios', NOW],
    );

    const loaded = await repo.findById('fb-badjson');
    expect(loaded).not.toBeNull();
    expect(loaded?.ocrCorrection).toBeUndefined();
    expect(loaded?.body).toBe('x');
  });
});

describe('review prompt ledger', () => {
  it('returns null before any prompt, then round-trips and upserts', async () => {
    expect(await repo.getLastPromptedAt(USER_A)).toBeNull();

    await repo.recordPrompt(USER_A, NOW);
    expect(await repo.getLastPromptedAt(USER_A)).toBe(NOW);

    const later = '2026-10-12T10:00:00.000Z';
    await repo.recordPrompt(USER_A, later);
    expect(await repo.getLastPromptedAt(USER_A)).toBe(later);

    // Other users are unaffected.
    expect(await repo.getLastPromptedAt(USER_B)).toBeNull();
  });
});

describe('feedback use cases over the sqlite adapter', () => {
  it('SubmitFeedbackUseCase stores a redacted record end-to-end', async () => {
    const useCase = new SubmitFeedbackUseCase(repo);
    const result = await useCase.execute({
      id: 'fb-uc-1',
      type: 'bug_report',
      body: 'The balances screen crashed. My email is alice@example.com if you need more detail.',
      appVersion: '2.1.0',
      platform: 'android',
      submittedAt: NOW,
      contactOptIn: false,
    });

    expect(result.id).toBe('fb-uc-1');
    expect(result.type).toBe('bug_report');

    const stored = await repo.findById('fb-uc-1');
    expect(stored?.body).not.toContain('alice@example.com');
  });

  it('SubmitNpsSurveyUseCase stores, then the cooldown reads back from the adapter', async () => {
    const useCase = new SubmitNpsSurveyUseCase(repo);
    const eligible = {
      daysSinceFirstLaunch: 30,
      totalExpensesCreated: 10,
      lastNpsSubmittedAt: null,
      nowIso: NOW,
    };
    expect(isEligibleForNps(eligible)).toBe(true);

    const first = await useCase.execute(
      {
        userId: USER_A,
        score: 8,
        body: 'Solid app.',
        appVersion: '2.1.0',
        platform: 'ios',
        submittedAt: NOW,
      },
      eligible,
    );
    expect(first.stored).toBe(true);
    expect(first.category).toBe('passive');

    // The adapter now reports the latest score → a second submission
    // within 90 days is cooldown-blocked.
    expect(await repo.findLatestNpsScore(USER_A)).toBe(8);
    const second = await useCase.execute(
      {
        userId: USER_A,
        score: 9,
        appVersion: '2.1.0',
        platform: 'ios',
        submittedAt: '2026-10-12T10:00:00.000Z',
      },
      {
        daysSinceFirstLaunch: 31,
        totalExpensesCreated: 12,
        lastNpsSubmittedAt: NOW,
        nowIso: '2026-10-12T10:00:00.000Z',
      },
    );
    expect(second.stored).toBe(false);
    expect(second.skipReason).toBe('cooldown_active');
  });

  it('PromptAppStoreReviewUseCase writes the ledger and honours the cooldown', async () => {
    const useCase = new PromptAppStoreReviewUseCase(repo);
    const eligible = {
      daysSinceFirstLaunch: 60,
      totalExpensesCreated: 20,
      latestNpsScore: 9,
      lastPromptedAt: null,
      nowIso: NOW,
    };

    const first = await useCase.execute({ userId: USER_A, currentTask: null, eligibility: eligible });
    expect(first.prompted).toBe(true);
    expect(first.reason).toBe('prompted');
    expect(await repo.getLastPromptedAt(USER_A)).toBe(NOW);

    // Immediately after a prompt, the 180-day cooldown blocks a second one.
    const second = await useCase.execute({
      userId: USER_A,
      currentTask: null,
      eligibility: { ...eligible, lastPromptedAt: NOW },
    });
    expect(second.prompted).toBe(false);
    expect(second.reason).toBe('not_eligible');

    // A financial task in progress always blocks the prompt.
    const blocked = await useCase.execute({
      userId: USER_B,
      currentTask: 'settlement_confirmation',
      eligibility: { ...eligible, lastPromptedAt: null },
    });
    expect(blocked.prompted).toBe(false);
    expect(blocked.reason).toBe('financial_task_active');
  });
});
