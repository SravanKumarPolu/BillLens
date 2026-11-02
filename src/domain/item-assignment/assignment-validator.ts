import type { DraftCharge } from '../entities/draft-charge';

import type { ItemAssignmentSession } from './item-assignment-session';

export interface AssignmentValidationResult {
  readonly isValid: boolean;
  readonly totalItemsMinor: number;
  readonly totalChargesMinor: number;
  readonly computedTotalMinor: number;
  readonly expectedTotalMinor: number;
  readonly unassignedCount: number;
  readonly errors: readonly string[];
}

export function validateAssignments(
  session: ItemAssignmentSession,
  charges: readonly DraftCharge[],
  expectedTotalMinor: number,
): AssignmentValidationResult {
  const errors: string[] = [];
  const totalItems = session.totalItemsMinor;
  const totalCharges = charges.reduce((acc, c) => acc + c.amountMinor, 0);
  const computedTotal = totalItems + totalCharges;

  if (session.unassignedItemIds.length > 0) {
    errors.push(`${session.unassignedItemIds.length} items have no member assignment`);
  }
  if (computedTotal !== expectedTotalMinor) {
    errors.push(
      `Items (${totalItems}) + charges (${totalCharges}) = ${computedTotal} does not match expected total (${expectedTotalMinor})`,
    );
  }

  return {
    isValid: errors.length === 0,
    totalItemsMinor: totalItems,
    totalChargesMinor: totalCharges,
    computedTotalMinor: computedTotal,
    expectedTotalMinor: expectedTotalMinor,
    unassignedCount: session.unassignedItemIds.length,
    errors,
  };
}
