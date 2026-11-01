import type { DraftChargeId } from '@shared-types/index';

import { InvalidEntityError } from '../errors/index';

export function asDraftChargeId(value: string): DraftChargeId {
  return value as DraftChargeId;
}

/**
 * The type of an extra charge (or discount) on an {@link ExpenseDraft}.
 *
 *   tax                    — sales tax / VAT / GST
 *   service_charge         — restaurant service charge
 *   tip                    — gratuity
 *   delivery               — delivery / shipping fee
 *   discount               — coupon / promo code discount (may be negative)
 *   rounding_adjustment    — small adjustment to make totals match (±)
 *   unassigned_amount      — residual amount the extractor couldn't classify (±)
 */
export type DraftChargeType =
  | 'tax'
  | 'service_charge'
  | 'tip'
  | 'delivery'
  | 'discount'
  | 'rounding_adjustment'
  | 'unassigned_amount';

/**
 * An extra charge (or discount) on an {@link ExpenseDraft} that is NOT
 * a line item — e.g. tax, tip, delivery fee, discount, rounding.
 *
 * Money is in minor units (integer paise / cents). Sign convention:
 *   - tax, service_charge, tip, delivery → non-negative
 *   - discount → may be negative (a discount reduces the total)
 *   - rounding_adjustment → may be negative
 *   - unassigned_amount → may be negative (residual can be either sign)
 *
 * `confidence` is 0–1, from extraction. Undefined if manually added.
 * `needsReview` is derived from `confidence` (true if < 0.85) unless
 * explicitly provided.
 */
export interface DraftCharge {
  readonly id: DraftChargeId;
  readonly type: DraftChargeType;
  readonly amountMinor: number;
  readonly label?: string;
  readonly confidence?: number;
  readonly needsReview: boolean;
}

export interface DraftChargeCreateInput {
  readonly id: DraftChargeId;
  readonly type: DraftChargeType;
  readonly amountMinor: number;
  readonly label?: string;
  readonly confidence?: number;
  readonly needsReview?: boolean;
}

/**
 * Create a DraftCharge.
 *
 * Validation:
 *   - amountMinor must be an integer
 *   - amountMinor must be non-negative for types other than
 *     `discount`, `rounding_adjustment`, and `unassigned_amount`
 *     (those three are allowed to be negative).
 */
export function createDraftCharge(input: DraftChargeCreateInput): DraftCharge {
  if (!Number.isInteger(input.amountMinor)) {
    throw new InvalidEntityError(
      `DraftCharge amount must be an integer, got ${input.amountMinor}`,
    );
  }
  // Discounts and rounding can be negative; others must be non-negative.
  if (
    input.type !== 'discount' &&
    input.type !== 'rounding_adjustment' &&
    input.type !== 'unassigned_amount' &&
    input.amountMinor < 0
  ) {
    throw new InvalidEntityError(
      `DraftCharge of type ${input.type} must be non-negative, got ${input.amountMinor}`,
    );
  }
  return {
    id: input.id,
    type: input.type,
    amountMinor: input.amountMinor,
    ...(input.label !== undefined ? { label: input.label } : {}),
    ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
    needsReview:
      input.needsReview ?? (input.confidence !== undefined && input.confidence < 0.85),
  };
}
