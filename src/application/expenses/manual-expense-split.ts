/**
 * Shared allocation logic for manual expense create and edit.
 *
 * Both paths must compute identical splits from the same input: the UI
 * preview, the create use case and the update use case all call this
 * module, so a member's share can never differ between creation and a
 * later edit.
 */

import { asMemberId } from '@domain/entities';
import { InvalidEntityError } from '@domain/errors';
import type { ExpenseItemCharge, ExpenseLineItem } from '@domain/entities/expense';
import { calculateItemSplit, calculateSplit } from '@domain/services/splits';
import { Money } from '@domain/value-objects';

/**
 * Split configuration. Amounts are member-keyed so the UI can stay keyed
 * by member id rather than array order; this module maps them to the
 * participant order the domain strategies expect.
 */
export type ManualSplitInput =
  | { readonly splitType: 'equal' }
  | {
      readonly splitType: 'exact';
      readonly allocations: readonly { readonly memberId: string; readonly amountMinor: number }[];
    }
  | {
      readonly splitType: 'percentage';
      readonly allocations: readonly { readonly memberId: string; readonly basisPoints: number }[];
    }
  | {
      readonly splitType: 'shares';
      readonly allocations: readonly { readonly memberId: string; readonly units: number }[];
    }
  | {
      readonly splitType: 'items';
      readonly lineItems: readonly ExpenseLineItem[];
      readonly charges?: readonly ExpenseItemCharge[];
    };

export interface ManualSplitRequest {
  readonly participantIds: readonly string[];
  readonly currencyCode: string;
  readonly split?: ManualSplitInput;
}

/**
 * Resolve the member-keyed split input through the domain engine.
 * Percentage/share metadata is persisted by the caller from the same
 * allocations, so validation happens once here.
 */
export function resolveManualSplit(
  request: ManualSplitRequest,
  total: Money,
): ReturnType<typeof calculateSplit> {
  const participantIds = request.participantIds.map(asMemberId);
  const split = request.split;
  if (split === undefined || split.splitType === 'equal') {
    return calculateSplit({ totalAmount: total, participantIds, splitType: 'equal' });
  }

  if (split.splitType === 'items') {
    return calculateItemSplit(
      total,
      participantIds,
      split.lineItems.map((item) => ({
        ...item,
        assignedMemberIds: item.assignedMemberIds.map(asMemberId),
      })),
      split.charges,
    );
  }

  const byMember = new Map<string, { amountMinor?: number; basisPoints?: number; units?: number }>();
  for (const allocation of split.allocations) {
    if (!request.participantIds.includes(allocation.memberId)) {
      throw new InvalidEntityError(
        `Split allocation references ${allocation.memberId}, who is not a participant.`,
      );
    }
    if (byMember.has(allocation.memberId)) {
      throw new InvalidEntityError(`Duplicate split allocation for ${allocation.memberId}.`);
    }
    byMember.set(allocation.memberId, allocation);
  }
  if (byMember.size !== request.participantIds.length) {
    throw new InvalidEntityError('Every participant needs a split allocation.');
  }

  if (split.splitType === 'exact') {
    return calculateSplit({
      totalAmount: total,
      participantIds,
      splitType: 'exact',
      exactAmounts: request.participantIds.map((memberId) =>
        Money.fromMinor(byMember.get(memberId)?.amountMinor ?? 0, request.currencyCode),
      ),
    });
  }
  if (split.splitType === 'percentage') {
    return calculateSplit({
      totalAmount: total,
      participantIds,
      splitType: 'percentage',
      basisPoints: request.participantIds.map(
        (memberId) => byMember.get(memberId)?.basisPoints ?? 0,
      ),
    });
  }
  return calculateSplit({
    totalAmount: total,
    participantIds,
    splitType: 'shares',
    shareUnits: request.participantIds.map((memberId) => byMember.get(memberId)?.units ?? 0),
  });
}
