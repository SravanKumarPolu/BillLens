/**
 * Shared branded primitive types.
 *
 * Branding prevents accidental mixing of string IDs (e.g. GroupId vs ExpenseId)
 * and gives the type system a way to enforce domain invariants at compile time.
 *
 * Branded types are erased at runtime — they're just strings/numbers.
 */

/**
 * Create a branded type. The brand is a phantom property that exists only at
 * compile time.
 *
 * @example
 *   type GroupId = Branded<string, 'GroupId'>;
 *   const id: GroupId = 'abc' as GroupId;
 */
export type Branded<T, B extends string> = T & { readonly __brand: B };

// ---------------------------------------------------------------------------
// ID types — each entity has its own branded ID to prevent mix-ups.
// Defined HERE (in shared-types) so all layers can reference them without
// circular imports. Entity files re-export the relevant IDs and provide
// `as<Id>()` constructor functions.
// ---------------------------------------------------------------------------
export type EntityId = Branded<string, 'EntityId'>;
export type GroupId = Branded<string, 'GroupId'>;
export type UserId = Branded<string, 'UserId'>;
export type MemberId = Branded<string, 'MemberId'>;
export type ExpenseId = Branded<string, 'ExpenseId'>;
export type ExpensePayerId = Branded<string, 'ExpensePayerId'>;
export type ExpenseSplitId = Branded<string, 'ExpenseSplitId'>;
export type SettlementId = Branded<string, 'SettlementId'>;
export type ReceiptId = Branded<string, 'ReceiptId'>;
export type ReceiptItemId = Branded<string, 'ReceiptItemId'>;
export type InviteId = Branded<string, 'InviteId'>;
export type InviteToken = Branded<string, 'InviteToken'>;
export type GuestIdentityId = Branded<string, 'GuestIdentityId'>;
// Phase 6 Track 4 — UPI-assisted settlement payment handles
export type PaymentHandleId = Branded<string, 'PaymentHandleId'>;

// ---------------------------------------------------------------------------
// Capture intelligence layer IDs (Prompt 3)
// ---------------------------------------------------------------------------
export type CaptureSourceId = Branded<string, 'CaptureSourceId'>;
export type ExtractionResultId = Branded<string, 'ExtractionResultId'>;
export type PaymentEvidenceId = Branded<string, 'PaymentEvidenceId'>;
export type DraftLineItemId = Branded<string, 'DraftLineItemId'>;
export type DraftChargeId = Branded<string, 'DraftChargeId'>;
export type FieldReviewIssueId = Branded<string, 'FieldReviewIssueId'>;
export type ExpenseDraftId = Branded<string, 'ExpenseDraftId'>;
export type DuplicateCandidateId = Branded<string, 'DuplicateCandidateId'>;

// ---------------------------------------------------------------------------
// Date / time
// ---------------------------------------------------------------------------
export type ISODateString = Branded<string, 'ISODateString'>;

// ---------------------------------------------------------------------------
// Money (Phase 1 placeholder — full Money value object lives in
// src/domain/value-objects/money.ts, added in Prompt 3)
// ---------------------------------------------------------------------------
export type MinorUnit = Branded<number, 'MinorUnit'>;

// ---------------------------------------------------------------------------
// Misc utility types
// ---------------------------------------------------------------------------
export type Maybe<T> = T | null;
export type ReadonlyNonEmptyArray<T> = readonly [T, ...T[]];
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
