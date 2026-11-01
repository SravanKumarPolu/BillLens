/**
 * Use case: Prompt the user for an App Store review.
 *
 * The use case delegates the gating decision to the pure
 * `shouldPromptForReview` function in the domain layer. It then:
 *
 *   1. Records the prompt time on the ledger (so the 180-day cooldown
 *      starts ticking).
 *   2. Returns `prompted: true` to the caller (presentation layer),
 *      which can then call into the platform-native review API.
 *
 * If the guard returns `false`, the use case returns `prompted: false`
 * and does NOT touch the ledger. The next call may still be eligible.
 */

import {
  isFinancialTask,
  shouldPromptForReview,
  type FinancialTask,
  type ReviewEligibility,
} from '@domain/feedback';

import type { ReviewPromptLedger } from './feedback-repository.port';

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export interface PromptAppStoreReviewInput {
  readonly userId: string;
  readonly currentTask: FinancialTask | null;
  readonly eligibility: ReviewEligibility;
}

export interface PromptAppStoreReviewOutput {
  readonly prompted: boolean;
  readonly reason: 'prompted' | 'financial_task_active' | 'not_eligible';
  readonly promptedAt: string | null;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class PromptAppStoreReviewUseCase {
  constructor(private readonly ledger: ReviewPromptLedger) {}

  async execute(input: PromptAppStoreReviewInput): Promise<PromptAppStoreReviewOutput> {
    // 1. Hard guard: never interrupt a financial task.
    if (input.currentTask !== null && isFinancialTask(input.currentTask)) {
      return {
        prompted: false,
        reason: 'financial_task_active',
        promptedAt: null,
      };
    }

    // 2. Delegate to the domain guard.
    if (!shouldPromptForReview(input.currentTask, input.eligibility)) {
      return {
        prompted: false,
        reason: 'not_eligible',
        promptedAt: null,
      };
    }

    // 3. Record the prompt time on the ledger (cooldown starts ticking).
    await this.ledger.recordPrompt(input.userId, input.eligibility.nowIso);

    return {
      prompted: true,
      reason: 'prompted',
      promptedAt: input.eligibility.nowIso,
    };
  }
}
