import type { MemberId } from '@shared-types/index';

import { InvalidEntityError, InvalidSplitError } from '../../errors/index';
import { Money } from '../../value-objects/money';

import type { SplitInput, SplitResult, SplitResultEntry, SplitStrategy } from './split-strategy';
import { assertTotalPreserved, prepareParticipants } from './split-strategy';

/**
 * A single line item on a receipt, prepared for the item-level split
 * strategy. The strategy computes per-member allocations by:
 *   1. For each item, divide its `totalAmountMinor` equally across its
 *      `assignedMemberIds` (with deterministic remainder handling).
 *   2. Sum each member's per-item allocations to get their final share.
 *   3. Add receipt-level charges (tax, service charge, tip, delivery,
 *      discount) proportionally across all participants.
 */
export interface ItemSplitLineItem {
  readonly id: string;
  readonly totalAmountMinor: number;
  readonly assignedMemberIds: readonly MemberId[];
  readonly quantity?: number;
  readonly unitPriceMinor?: number;
  readonly discountMinor?: number;
  readonly taxMinor?: number;
}

/**
 * Receipt-level charges applied AFTER item totals. These are distributed
 * across all participants (not just those assigned to specific items).
 *
 * Convention:
 *   - Positive values (tax, service charge, tip, delivery) ADD to the total.
 *   - Negative values (discount) SUBTRACT from the total.
 *
 * The strategy validates:
 *   - `Σ item.totalAmountMinor + Σ charges.amountMinor === totalAmount.toMinor()`
 *   - Every `assignedMemberIds` list is non-empty and contains only IDs
 *     that appear in `participantIds`.
 */
export interface ItemSplitCharge {
  readonly type:
    | 'tax'
    | 'service_charge'
    | 'tip'
    | 'delivery'
    | 'discount'
    | 'rounding_adjustment'
    | 'unassigned_amount';
  readonly amountMinor: number;
  /** Human-readable label for audit / explanation engine. */
  readonly label?: string;
}

export interface ItemSplitInput extends SplitInput {
  readonly lineItems: readonly ItemSplitLineItem[];
  readonly charges?: readonly ItemSplitCharge[];
}

export class ItemSplitStrategy implements SplitStrategy<ItemSplitInput> {
  readonly splitType = 'items' as const;

  calculate(input: ItemSplitInput): SplitResult {
    if (input.lineItems.length === 0) {
      throw new InvalidSplitError('Item split: line items list is empty');
    }

    // Prepare participants (validates uniqueness, sorts).
    const sortedIds = prepareParticipants(input.participantIds);
    const participantSet = new Set(sortedIds.map((id) => id as string));

    // Validate that every item's assignedMemberIds is non-empty and
    // contains only known participants.
    for (const item of input.lineItems) {
      if (item.assignedMemberIds.length === 0) {
        throw new InvalidSplitError(
          `Item split: item ${item.id} has no assigned members`,
        );
      }
      if (!Number.isInteger(item.totalAmountMinor) || item.totalAmountMinor < 0) {
        throw new InvalidEntityError(
          `Item split: item ${item.id} has invalid total ${item.totalAmountMinor}`,
        );
      }
      // If quantity and unitPriceMinor are both provided, validate that
      // totalAmountMinor === quantity * unitPriceMinor - discount + tax.
      if (item.quantity !== undefined && item.unitPriceMinor !== undefined) {
        const discount = item.discountMinor ?? 0;
        const tax = item.taxMinor ?? 0;
        const expectedTotal =
          item.quantity * item.unitPriceMinor - discount + tax;
        if (item.totalAmountMinor !== expectedTotal) {
          throw new InvalidSplitError(
            `Item split: item ${item.id} total (${item.totalAmountMinor}) does not match ` +
              `quantity (${item.quantity}) * unitPriceMinor (${item.unitPriceMinor}) ` +
              `- discount (${discount}) + tax (${tax}) = ${expectedTotal}`,
          );
        }
      }
      for (const memberId of item.assignedMemberIds) {
        if (!participantSet.has(memberId as string)) {
          throw new InvalidSplitError(
            `Item split: item ${item.id} assigns to unknown member ${memberId}`,
          );
        }
      }
    }

    // Validate charges are integers (may be negative for discounts).
    const charges = input.charges ?? [];
    for (const charge of charges) {
      if (!Number.isInteger(charge.amountMinor)) {
        throw new InvalidEntityError(
          `Item split: charge ${charge.type} has non-integer amount ${charge.amountMinor}`,
        );
      }
      // Discounts, rounding adjustments, and unassigned amounts may be
      // negative; all other charge types must be non-negative.
      if (
        charge.type !== 'discount' &&
        charge.type !== 'rounding_adjustment' &&
        charge.type !== 'unassigned_amount' &&
        charge.amountMinor < 0
      ) {
        throw new InvalidEntityError(
          `Item split: charge of type ${charge.type} must be non-negative, got ${charge.amountMinor}`,
        );
      }
    }

    // Validate the receipt total equals items + charges.
    const itemsTotal = input.lineItems.reduce((acc, i) => acc + i.totalAmountMinor, 0);
    const chargesTotal = charges.reduce((acc, c) => acc + c.amountMinor, 0);
    const computedTotal = itemsTotal + chargesTotal;
    if (computedTotal !== input.totalAmount.toMinor()) {
      throw new InvalidSplitError(
        `Item split: items (${itemsTotal}) + charges (${chargesTotal}) = ${computedTotal} does not match total (${input.totalAmount.toMinor()})`,
      );
    }

    // Step 1: distribute each item's total across its assigned members.
    const perMemberItemShares = new Map<string, number>();
    for (const id of sortedIds) {
      perMemberItemShares.set(id as string, 0);
    }

    for (const item of input.lineItems) {
      // Sort the assigned member IDs deterministically (same convention
      // as EqualSplit — remainder goes to earliest after sort).
      const sortedAssignees = [...item.assignedMemberIds].sort((a, b) => {
        const sa = a as string;
        const sb = b as string;
        if (sa < sb) return -1;
        if (sa > sb) return 1;
        return 0;
      });
      const itemMoney = Money.fromMinor(item.totalAmountMinor, input.totalAmount.getCurrency());
      const allocations = itemMoney.allocate(sortedAssignees.length);
      sortedAssignees.forEach((memberId, i) => {
        const alloc = allocations[i];
        if (!alloc) {
          throw new Error('Internal error: allocation index out of range');
        }
        const current = perMemberItemShares.get(memberId as string) ?? 0;
        perMemberItemShares.set(memberId as string, current + alloc.toMinor());
      });
    }

    // Step 2: distribute each charge proportionally across ALL participants.
    // Charges are weighted by each participant's current item share.
    // (A participant who ordered more pays proportionally more of the tax.)
    //
    // Edge case: if total item shares is 0 (all items free — unusual but
    // possible with 100% discounts on items), distribute charges equally.
    const perMemberChargeShares = new Map<string, number>();
    for (const id of sortedIds) {
      perMemberChargeShares.set(id as string, 0);
    }
    const totalItemShares = Array.from(perMemberItemShares.values()).reduce((a, b) => a + b, 0);

    for (const charge of charges) {
      if (charge.amountMinor === 0) continue;
      const chargeMoney = Money.fromMinor(charge.amountMinor, input.totalAmount.getCurrency());
      if (totalItemShares === 0) {
        // Equal distribution.
        const allocations = chargeMoney.allocate(sortedIds.length);
        sortedIds.forEach((memberId, i) => {
          const alloc = allocations[i];
          if (!alloc) return;
          const current = perMemberChargeShares.get(memberId as string) ?? 0;
          perMemberChargeShares.set(memberId as string, current + alloc.toMinor());
        });
      } else {
        // Proportional distribution by item share weights.
        // Participants with 0 item share receive 0 of the charge (they
        // didn't consume anything, so they don't pay tax/service charge).
        const membersWithShares = sortedIds.filter(
          (id) => (perMemberItemShares.get(id as string) ?? 0) > 0,
        );
        if (membersWithShares.length === 0) {
          // All shares are 0 despite totalItemShares > 0 — shouldn't happen,
          // but fall back to equal distribution to preserve total.
          const allocations = chargeMoney.allocate(sortedIds.length);
          sortedIds.forEach((memberId, i) => {
            const alloc = allocations[i];
            if (!alloc) return;
            const current = perMemberChargeShares.get(memberId as string) ?? 0;
            perMemberChargeShares.set(memberId as string, current + alloc.toMinor());
          });
        } else {
          const weights = membersWithShares.map(
            (id) => perMemberItemShares.get(id as string) ?? 0,
          );
          const allocations = chargeMoney.allocateByWeights(weights);
          membersWithShares.forEach((memberId, i) => {
            const alloc = allocations[i];
            if (!alloc) return;
            const current = perMemberChargeShares.get(memberId as string) ?? 0;
            perMemberChargeShares.set(memberId as string, current + alloc.toMinor());
          });
        }
      }
    }

    // Step 3: combine item shares + charge shares per member.
    const entries: SplitResultEntry[] = sortedIds.map((memberId) => {
      const items = perMemberItemShares.get(memberId as string) ?? 0;
      const chargesForMember = perMemberChargeShares.get(memberId as string) ?? 0;
      return {
        memberId,
        amountMinor: items + chargesForMember,
      };
    });

    assertTotalPreserved(input.totalAmount.toMinor(), entries);
    return {
      splitType: this.splitType,
      totalAmountMinor: input.totalAmount.toMinor(),
      currency: input.totalAmount.getCurrency(),
      entries,
    };
  }
}

export function calculateItemSplit(
  totalAmount: Money,
  participantIds: readonly MemberId[],
  lineItems: readonly ItemSplitLineItem[],
  charges?: readonly ItemSplitCharge[],
): SplitResult {
  return new ItemSplitStrategy().calculate({
    totalAmount,
    participantIds,
    lineItems,
    charges,
  });
}
