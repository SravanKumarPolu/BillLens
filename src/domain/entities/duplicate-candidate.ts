import type { DuplicateCandidateId } from '@shared-types/index';

import { InvalidEntityError } from '../errors/index';
import type { DateTime } from '../value-objects/date-time';
import { nowDateTime } from '../value-objects/index';

export function asDuplicateCandidateId(value: string): DuplicateCandidateId {
  return value as DuplicateCandidateId;
}

/**
 * The basis on which two entities were flagged as potential duplicates.
 *
 *   transaction_reference  — Same UPI/bank transaction ID
 *   image_hash             — Same image bytes (SHA-256 collision)
 *   amount_and_merchant    — Same amount + merchant + date
 *   ocr_fingerprint        — Similar OCR text (fuzzy match)
 *   manual                 — User flagged manually
 */
export type DuplicateMatchBasis =
  | 'transaction_reference'
  | 'image_hash'
  | 'amount_and_merchant'
  | 'ocr_fingerprint'
  | 'manual';

/**
 * The user's resolution of a duplicate candidate.
 *
 *   pending              — Not yet reviewed by the user
 *   confirmed_duplicate  — User confirmed: yes, it's a duplicate
 *   not_duplicate        — User confirmed: no, they're different
 *   merged               — User chose to merge the two entities
 */
export type DuplicateResolution = 'pending' | 'confirmed_duplicate' | 'not_duplicate' | 'merged';

/**
 * A potential duplicate detected during capture/extraction.
 *
 * Compares a newly-captured entity (a CaptureSource, ExtractionResult,
 * ExpenseDraft, or PaymentEvidence) against existing entities in the
 * same group. The user resolves the candidate via
 * {@link resolveDuplicateCandidate}.
 *
 * `newEntityId` and `existingEntityId` are opaque string IDs — they
 * are NOT typed as branded IDs because the candidate may reference any
 * of several entity types. The `matchDetails` map carries the
 * type-specific context (e.g. `{ "newType": "capture_source",
 * "existingType": "receipt" }`).
 *
 * `matchConfidence` is in [0, 1]. The thresholds for surfacing a
 * candidate to the user are policy decisions in the application layer
 * (typically: > 0.7 for image_hash, > 0.9 for transaction_reference).
 */
export interface DuplicateCandidate {
  readonly id: DuplicateCandidateId;
  readonly groupId?: string;
  readonly newEntityId: string;
  readonly existingEntityId: string;
  readonly matchBasis: DuplicateMatchBasis;
  readonly matchConfidence: number;
  readonly matchDetails: Readonly<Record<string, unknown>>;
  readonly resolution: DuplicateResolution;
  readonly resolvedAt?: DateTime;
  readonly resolvedBy?: string;
  readonly createdAt: DateTime;
  readonly version: number;
}

export interface DuplicateCandidateCreateInput {
  readonly id: DuplicateCandidateId;
  readonly groupId?: string;
  readonly newEntityId: string;
  readonly existingEntityId: string;
  readonly matchBasis: DuplicateMatchBasis;
  readonly matchConfidence: number;
  readonly matchDetails: Readonly<Record<string, unknown>>;
  readonly now?: DateTime;
}

/**
 * Create a new DuplicateCandidate.
 *
 * Validation:
 *   - `matchConfidence` must be a finite number in [0, 1]
 *   - `newEntityId` and `existingEntityId` must differ
 *
 * New candidates always have `resolution = 'pending'` and `version = 1`.
 */
export function createDuplicateCandidate(
  input: DuplicateCandidateCreateInput,
): DuplicateCandidate {
  if (
    !Number.isFinite(input.matchConfidence) ||
    input.matchConfidence < 0 ||
    input.matchConfidence > 1
  ) {
    throw new InvalidEntityError(
      `Match confidence must be in [0, 1], got ${input.matchConfidence}`,
    );
  }
  if (input.newEntityId === input.existingEntityId) {
    throw new InvalidEntityError('newEntityId and existingEntityId cannot be the same');
  }
  const now = input.now ?? nowDateTime();
  return {
    id: input.id,
    ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
    newEntityId: input.newEntityId,
    existingEntityId: input.existingEntityId,
    matchBasis: input.matchBasis,
    matchConfidence: input.matchConfidence,
    matchDetails: input.matchDetails,
    resolution: 'pending',
    createdAt: now,
    version: 1,
  };
}

/**
 * Resolve a DuplicateCandidate.
 *
 * Once resolved (any non-`pending` value), the candidate is immutable —
 * further calls throw {@link InvalidEntityError}.
 *
 * `resolvedBy` is an opaque string (typically a UserId) — kept as a
 * string here to avoid importing UserId into this entity file (it
 * doesn't need it for any other purpose).
 */
export function resolveDuplicateCandidate(
  current: DuplicateCandidate,
  resolution: DuplicateResolution,
  resolvedBy?: string,
  now?: DateTime,
): DuplicateCandidate {
  if (current.resolution !== 'pending') {
    throw new InvalidEntityError(
      `DuplicateCandidate ${current.id} is already resolved as ${current.resolution}`,
    );
  }
  const ts = now ?? nowDateTime();
  return {
    ...current,
    resolution,
    resolvedAt: ts,
    ...(resolvedBy !== undefined ? { resolvedBy } : {}),
    version: current.version + 1,
  };
}
