import type { MemberId, ReceiptId, ReceiptItemId } from '@shared-types/index';

import {
  DeletedEntityError,
  EmptyValueError,
  InvalidEntityError,
  ValueTooLongError,
  VersionConflictError,
} from '../errors/index';
import {
  type DateTime,
  type VersionNumber,
  asDateTime,
  asVersionNumber,
  initialVersionNumber,
  nowDateTime,
} from '../value-objects/index';


export function asReceiptItemId(value: string): ReceiptItemId {
  return value as ReceiptItemId;
}

export const RECEIPT_ITEM_NAME_MAX_LENGTH = 200;

/**
 * A single line item on a receipt. Used for item-level splitting.
 *
 * Each item may be assigned to one or more members (the `assignedMemberIds`
 * list). When multiple members are assigned, the item's `totalAmountMinor`
 * is split equally among them (with deterministic remainder handling —
 * see split engine).
 */
export interface ReceiptItem {
  readonly id: ReceiptItemId;
  readonly receiptId: ReceiptId;
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly discountMinor?: number;
  readonly taxMinor?: number;
  readonly totalAmountMinor: number;
  readonly assignedMemberIds: readonly MemberId[];
  readonly createdAt: DateTime;
  readonly updatedAt: DateTime;
  readonly deletedAt?: DateTime;
  readonly version: VersionNumber;
}

export interface ReceiptItemCreateInput {
  readonly id: ReceiptItemId;
  readonly receiptId: ReceiptId;
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly discountMinor?: number;
  readonly taxMinor?: number;
  readonly assignedMemberIds?: readonly MemberId[];
  readonly now?: DateTime;
}

export function createReceiptItem(input: ReceiptItemCreateInput): ReceiptItem {
  const trimmedName = input.name.trim();
  if (trimmedName.length === 0) {
    throw new EmptyValueError('Receipt item name must not be empty');
  }
  if (trimmedName.length > RECEIPT_ITEM_NAME_MAX_LENGTH) {
    throw new ValueTooLongError(
      `Receipt item name too long: ${trimmedName.length}`,
      'name',
      RECEIPT_ITEM_NAME_MAX_LENGTH,
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
  if (input.discountMinor !== undefined && (!Number.isInteger(input.discountMinor) || input.discountMinor < 0)) {
    throw new InvalidEntityError(
      `Discount must be a non-negative integer, got ${input.discountMinor}`,
    );
  }
  if (input.taxMinor !== undefined && (!Number.isInteger(input.taxMinor) || input.taxMinor < 0)) {
    throw new InvalidEntityError(
      `Tax must be a non-negative integer, got ${input.taxMinor}`,
    );
  }
  const totalAmountMinor = computeItemTotal(input);
  const now = input.now ?? nowDateTime();
  return {
    id: input.id,
    receiptId: input.receiptId,
    name: trimmedName,
    quantity: input.quantity,
    unitPriceMinor: input.unitPriceMinor,
    ...(input.discountMinor !== undefined ? { discountMinor: input.discountMinor } : {}),
    ...(input.taxMinor !== undefined ? { taxMinor: input.taxMinor } : {}),
    totalAmountMinor,
    assignedMemberIds: input.assignedMemberIds ?? [],
    createdAt: asDateTime(now),
    updatedAt: asDateTime(now),
    version: initialVersionNumber(),
  };
}

export interface ReceiptItemSoftDeleteInput {
  readonly now?: DateTime;
  readonly expectedVersion: VersionNumber;
}

/**
 * Soft-delete a `ReceiptItem`.
 *
 * Soft-deletion preserves the row for historical integrity (audit trail,
 * receipt reconstruction) but excludes it from future item-split
 * calculations and prevents further mutation. The item's `version` is
 * incremented so optimistic-concurrency clients detect the change.
 *
 * @throws `VersionConflictError` if `expectedVersion` does not match the
 *   item's current `version`.
 * @throws `DeletedEntityError` if the item is already soft-deleted.
 */
export function softDeleteReceiptItem(
  current: ReceiptItem,
  input: ReceiptItemSoftDeleteInput,
): ReceiptItem {
  if (current.version !== input.expectedVersion) {
    throw new VersionConflictError(
      `ReceiptItem version conflict: expected ${input.expectedVersion}, got ${current.version}`,
      input.expectedVersion as number,
      current.version as number,
    );
  }
  if (current.deletedAt) {
    throw new DeletedEntityError(
      `ReceiptItem ${current.id} is already deleted`,
      'ReceiptItem',
      current.id,
    );
  }
  const now = input.now ?? nowDateTime();
  return {
    ...current,
    deletedAt: asDateTime(now),
    updatedAt: asDateTime(now),
    version: asVersionNumber(current.version + 1),
  };
}

/**
 * Compute the total for a receipt item:
 *
 *   total = (quantity × unitPrice) − discount + tax
 *
 * All values are in minor units (integers).
 */
export function computeItemTotal(input: {
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
      `Receipt item total is negative: gross=${gross}, discount=${discount}, tax=${tax}`,
    );
  }
  return total;
}

/**
 * Validate that the sum of item totals matches a receipt's claimed total.
 */
export function validateReceiptItemTotal(
  items: readonly ReceiptItem[],
  expectedTotalMinor: number,
): void {
  const sum = items.reduce((acc, i) => acc + i.totalAmountMinor, 0);
  if (sum !== expectedTotalMinor) {
    throw new InvalidEntityError(
      `Sum of receipt item totals (${sum}) does not equal receipt total (${expectedTotalMinor})`,
    );
  }
}
