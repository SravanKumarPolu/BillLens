/**
 * Use case: Submit user feedback.
 *
 * Privacy contract:
 *   1. The raw body is redacted by `redactFeedbackBodyForType` BEFORE
 *      the feedback entity is constructed. The repository only ever
 *      sees a redacted body.
 *   2. For `bug_report` feedback, attachment references are stripped
 *      entirely (never uploaded).
 *   3. The use case validates the feedback type, body length, NPS
 *      score (for `nps` type), and timestamps.
 */

import {
  FEEDBACK_BODY_MAX_LENGTH,
  FEEDBACK_TYPES,
  createFeedback,
  isValidNpsScore,
  redactFeedbackBodyForType,
  type Feedback,
  type FeedbackType,
  type OcrCorrectionMeta,
} from '@domain/feedback';

import type { FeedbackRepository } from './feedback-repository.port';

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export interface SubmitFeedbackInput {
  readonly id: string;
  readonly type: FeedbackType;
  readonly body: string;
  readonly npsScore?: number;
  readonly ocrCorrection?: OcrCorrectionMeta;
  readonly appVersion: string;
  readonly platform: 'ios' | 'android' | 'web';
  readonly submittedAt: string;
  readonly contactOptIn: boolean;
}

export interface SubmitFeedbackOutput {
  readonly id: string;
  readonly type: FeedbackType;
  readonly redactedBodyPreview: string;
  readonly npsScore?: number;
  readonly storedAt: string;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class SubmitFeedbackUseCase {
  constructor(private readonly repo: FeedbackRepository) {}

  async execute(input: SubmitFeedbackInput): Promise<SubmitFeedbackOutput> {
    // 1. Validate feedback type.
    if (!FEEDBACK_TYPES.includes(input.type)) {
      throw new Error(`Unknown feedback type: ${input.type}`);
    }

    // 2. Validate body length (BEFORE redaction — the redactor may
    //    shrink the body by removing attachments, so we cap the raw
    //    input length and let the redactor do its work).
    if (input.body.length > FEEDBACK_BODY_MAX_LENGTH * 2) {
      throw new Error(
        `Feedback body too long: ${input.body.length} > ${FEEDBACK_BODY_MAX_LENGTH * 2}`,
      );
    }

    // 3. Validate NPS score (for `nps` type).
    if (input.type === 'nps') {
      if (input.npsScore === undefined) {
        throw new Error('NPS feedback requires a npsScore');
      }
      if (!isValidNpsScore(input.npsScore)) {
        throw new Error(`Invalid NPS score: ${input.npsScore}`);
      }
    } else if (input.npsScore !== undefined) {
      throw new Error(`Non-NPS feedback (${input.type}) must not carry a npsScore`);
    }

    // 4. Validate timestamps.
    if (Number.isNaN(Date.parse(input.submittedAt))) {
      throw new Error('submittedAt must be a valid ISO date-time');
    }

    // 5. Redact body.
    const redactedBody = redactFeedbackBodyForType(input.body, input.type);

    // 6. Cap the redacted body length.
    const cappedBody = redactedBody.slice(0, FEEDBACK_BODY_MAX_LENGTH);

    // 7. Construct feedback entity.
    const feedback: Feedback = createFeedback({
      id: input.id,
      type: input.type,
      body: cappedBody,
      ...(input.npsScore !== undefined ? { npsScore: input.npsScore } : {}),
      ...(input.ocrCorrection !== undefined ? { ocrCorrection: input.ocrCorrection } : {}),
      appVersion: input.appVersion,
      platform: input.platform,
      submittedAt: input.submittedAt,
      contactOptIn: input.contactOptIn,
    });

    // 8. Persist.
    await this.repo.save(feedback);

    return {
      id: feedback.id,
      type: feedback.type,
      redactedBodyPreview: feedback.body.slice(0, 200),
      ...(feedback.npsScore !== undefined ? { npsScore: feedback.npsScore } : {}),
      storedAt: feedback.submittedAt,
    };
  }
}
