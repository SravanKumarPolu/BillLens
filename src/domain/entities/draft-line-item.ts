import type { DraftLineItemId, MemberId } from '@shared-types/index';

import { EmptyValueError, InvalidEntityError, ValueTooLongError } from '../errors/index';

export function asDraftLineItemId(value: string): DraftLineItemId {
  return value as DraftLineItemId;
}

export const DRAFT_ITEM_NAME_MAX_LENGTH = 200;

/**
 * A single editable line item in an {@link ExpenseDraft}.
 *
 * Unlike {@link ExtractedLineItem} (which is the immutable OCR output),
 * a DraftLineItem is what the user actually sees and edits in the review
 * UI. It carries an optional `confidence` (0–1, from extraction) and a
 * `needsReview` flag derived from that confidence.
 *
 * All money fields are in minor units (integer paise / cents).
 *
 * `assignedMemberIds` is the set of group members this item is currently
 * assigned to (for item-level splits). Empty array means "unassigned" —
 * the user must assign at least one member before the draft can be
 * confirmed.
 */
export interface DraftLineItem {
  readonly id: DraftLineItemId;
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly discountMinor?: number;
  readonly taxMinor?: number;
  readonly totalAmountMinor: number;
  readonly assignedMemberIds: readonly MemberId[];
  /** 0–1, from extraction. Undefined if manually added by the user. */
  readonly confidence?: number;
  readonly needsReview: boolean;
}

export interface DraftLineItemCreateInput {
  readonly id: DraftLineItemId;
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly discountMinor?: number;
  readonly taxMinor?: number;
  readonly assignedMemberIds?: readonly MemberId[];
  readonly confidence?: number;
  readonly needsReview?: boolean;
}

/**
 * Create a DraftLineItem.
 *
 * Validation:
 *   - name: non-empty (after trim), <= 200 chars
 *   - quantity: positive integer
 *   - unitPriceMinor: non-negative integer
 *   - discountMinor: non-negative integer (optional)
 *   - taxMinor: non-negative integer (optional)
 *
 * `totalAmountMinor` is COMPUTED, not provided — it equals
 * `quantity * unitPriceMinor - discountMinor + taxMinor`. Throws if the
 * result would be negative.
 *
 * `needsReview` defaults to true if `confidence` is provided and < 0.85,
 * false otherwise. Callers can override with an explicit `needsReview`.
 */
export function createDraftLineItem(input: DraftLineItemCreateInput): DraftLineItem {
  const trimmedName = input.name.trim();
  if (trimmedName.length === 0) {
    throw new EmptyValueError('DraftLineItem name must not be empty');
  }
  if (trimmedName.length > DRAFT_ITEM_NAME_MAX_LENGTH) {
    throw new ValueTooLongError(
      'DraftLineItem name too long',
      'name',
      DRAFT_ITEM_NAME_MAX_LENGTH,
      trimmedName.length,
    );
  }
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new InvalidEntityError(
      `Quantity must be a positive integer, got ${input.quantity}`,
    );
  }
  if (!Number.isInteger(input.unitPriceMinor) || input.unitPriceMinor < 0) {
    throw new InvalidEntityError(
      `Unit price must be a non-negative integer, got ${input.unitPriceMinor}`,
    );
  }
  if (
    input.discountMinor !== undefined &&
    (!Number.isInteger(input.discountMinor) || input.discountMinor < 0)
  ) {
    throw new InvalidEntityError(
      `Discount must be a non-negative integer, got ${input.discountMinor}`,
    );
  }
  if (
    input.taxMinor !== undefined &&
    (!Number.isInteger(input.taxMinor) || input.taxMinor < 0)
  ) {
    throw new InvalidEntityError(
      `Tax must be a non-negative integer, got ${input.taxMinor}`,
    );
  }
  const totalAmountMinor = computeDraftItemTotal(input);
  return {
    id: input.id,
    name: trimmedName,
    quantity: input.quantity,
    unitPriceMinor: input.unitPriceMinor,
    ...(input.discountMinor !== undefined ? { discountMinor: input.discountMinor } : {}),
    ...(input.taxMinor !== undefined ? { taxMinor: input.taxMinor } : {}),
    totalAmountMinor,
    assignedMemberIds: input.assignedMemberIds ?? [],
    ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
    needsReview:
      input.needsReview ?? (input.confidence !== undefined && input.confidence < 0.85),
  };
}

/**
 * Compute the total minor-unit amount for a draft line item.
 *
 *   total = quantity * unitPrice - discount + tax
 *
 * Throws {@link InvalidEntityError} if the result is negative (e.g.
 * discount exceeds gross).
 */
export function computeDraftItemTotal(input: {
  quantity: number;
  unitPriceMinor: number;
  discountMinor?: number;
  taxMinor?: number;
}): number {
  const gross = input.quantity * input.unitPriceMinor;
  const discount = input.discountMinor ?? 0;
  const tax = input.taxMinor ?? 0;
  const total = gross - discount + tax;
  if (total < 0) {
    throw new InvalidEntityError(
      `DraftLineItem total is negative: gross=${gross}, discount=${discount}, tax=${tax}`,
    );
  }
  return total;
}
