/**
 * Barrel for the feedback domain module.
 */

export {
  FEEDBACK_BODY_MAX_LENGTH,
  FEEDBACK_TYPES,
  NPS_MAX_SCORE,
  NPS_MIN_SCORE,
  createFeedback,
  isValidNpsScore,
  npsCategory,
  type Feedback,
  type FeedbackCreateInput,
  type FeedbackType,
  type NpsCategory,
  type OcrCorrectionMeta,
} from './feedback-model';

export {
  containsResidualFeedbackPii,
  redactFeedbackBody,
  redactFeedbackBodyForType,
  type FeedbackRedactionLevel,
} from './feedback-redactor';

export {
  MIN_DAYS_SINCE_LAUNCH,
  MIN_EXPENSES_CREATED,
  MIN_NPS_SCORE_FOR_REVIEW,
  PROMPT_COOLDOWN_DAYS,
  PROMPT_COOLDOWN_MS,
  isFinancialTask,
  nextEligiblePromptTime,
  shouldPromptForReview,
  type FinancialTask,
  type ReviewEligibility,
} from './review-prompt-guard';
