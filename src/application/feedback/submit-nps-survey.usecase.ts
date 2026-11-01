/**
 * Use case: Submit an NPS survey.
 *
 * Eligibility rules:
 *   - User must have used the app for 7+ days.
 *   - User must have created 5+ expenses.
 *   - User must NOT have been prompted for NPS within the last 90 days.
 *
 * Returns the stored NPS score + category (detractor/passive/promoter).
 */

import { isValidNpsScore, npsCategory, type NpsCategory } from '@domain/feedback';

import type { FeedbackRepository } from './feedback-repository.port';

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export interface SubmitNpsSurveyInput {
  readonly userId: string;
  readonly score: number;
  readonly body?: string;
  readonly appVersion: string;
  readonly platform: 'ios' | 'android' | 'web';
  readonly submittedAt: string;
}

export interface SubmitNpsSurveyOutput {
  readonly stored: boolean;
  readonly score: number;
  readonly category: NpsCategory;
  /** Reason the survey was NOT stored (when `stored === false`). */
  readonly skipReason?: 'invalid_score' | 'cooldown_active';
}

// ---------------------------------------------------------------------------
// NPS eligibility thresholds
// ---------------------------------------------------------------------------

export const NPS_MIN_DAYS_SINCE_LAUNCH = 7;
export const NPS_MIN_EXPENSES_CREATED = 5;
export const NPS_COOLDOWN_DAYS = 90;
const NPS_COOLDOWN_MS = NPS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

export interface NpsEligibility {
  readonly daysSinceFirstLaunch: number;
  readonly totalExpensesCreated: number;
  readonly lastNpsSubmittedAt: string | null;
  readonly nowIso: string;
}

export function isEligibleForNps(eligibility: NpsEligibility): boolean {
  if (eligibility.daysSinceFirstLaunch < NPS_MIN_DAYS_SINCE_LAUNCH) return false;
  if (eligibility.totalExpensesCreated < NPS_MIN_EXPENSES_CREATED) return false;
  if (eligibility.lastNpsSubmittedAt !== null) {
    const nowMs = Date.parse(eligibility.nowIso);
    const lastMs = Date.parse(eligibility.lastNpsSubmittedAt);
    if (Number.isFinite(nowMs) && Number.isFinite(lastMs)) {
      if (nowMs - lastMs < NPS_COOLDOWN_MS) return false;
    } else {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class SubmitNpsSurveyUseCase {
  constructor(private readonly repo: FeedbackRepository) {}

  async execute(
    input: SubmitNpsSurveyInput,
    eligibility: NpsEligibility,
  ): Promise<SubmitNpsSurveyOutput> {
    // 1. Validate score shape.
    if (!isValidNpsScore(input.score)) {
      return {
        stored: false,
        score: input.score,
        category: 'detractor', // safe default for invalid input
        skipReason: 'invalid_score',
      };
    }

    // 2. Check eligibility.
    if (!isEligibleForNps(eligibility)) {
      return {
        stored: false,
        score: input.score,
        category: npsCategory(input.score),
        skipReason: 'cooldown_active',
      };
    }

    // 3. The actual persistence is delegated to the feedback repository
    //    via a feedback record of type 'nps'. The body is optional and
    //    is redacted by the feedback redactor (see SubmitFeedbackUseCase).
    //    This use case is a thin eligibility gate; we don't re-implement
    //    redaction here.
    const id = `${input.userId}-nps-${Date.parse(input.submittedAt)}`;
    await this.repo.save({
      id,
      type: 'nps',
      body: input.body ?? '',
      npsScore: input.score,
      npsCategory: npsCategory(input.score),
      appVersion: input.appVersion,
      platform: input.platform,
      submittedAt: input.submittedAt,
      contactOptIn: false,
    });

    return {
      stored: true,
      score: input.score,
      category: npsCategory(input.score),
    };
  }
}
