// Domain entities barrel.
//
// Re-exports all entity types and their factory functions. Value objects
// are re-exported from `../value-objects`.

// Re-export branded ID types from shared-types so callers can do
// `import { type GroupId, asGroupId } from '@domain/entities'` without
// having to know about the shared-types module.
export type {
  CaptureSourceId,
  DuplicateCandidateId,
  DraftChargeId,
  DraftLineItemId,
  EntityId,
  ExpenseDraftId,
  ExpenseId,
  ExpensePayerId,
  ExpenseSplitId,
  ExtractionResultId,
  FieldReviewIssueId,
  GroupId,
  GuestIdentityId,
  InviteId,
  InviteToken,
  MemberId,
  PaymentEvidenceId,
  PaymentHandleId,
  ReceiptId,
  ReceiptItemId,
  SettlementId,
  UserId,
} from '@shared-types/index';

export * from './user';
export * from './guest-identity';
export * from './group';
export * from './group-member';
export * from './group-invite';
export * from './expense';
export * from './expense-payer';
export * from './expense-split';
export * from './receipt';
export * from './receipt-privacy-preference';
export * from './receipt-item';
export * from './settlement';
export * from './currency';
export * from './sync-metadata';
export * from './linked-auth-identity';

// Capture intelligence layer (Prompt 3)
export * from './capture-source';
export * from './extraction-result';
export * from './payment-evidence';
export * from './draft-line-item';
export * from './draft-charge';
export * from './field-review-issue';
export * from './expense-draft';
export * from './duplicate-candidate';

// Phase 6 Track 4 — UPI-assisted settlement payment handles
export * from './member-payment-handle';

// Phase 6 Track 6 — Settlement reminders
export * from './settlement-reminder';
