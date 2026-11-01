import type { MemberId } from '@shared-types/index';

import type { DraftLineItem } from '../entities/draft-line-item';

export interface AssignmentEntry {
  readonly itemId: string;
  readonly memberIds: readonly MemberId[];
  readonly amountPerMember: number; // item total / number of assigned members
}

export interface ItemAssignmentSession {
  readonly groupId: string;
  readonly memberIds: readonly MemberId[];
  readonly items: readonly DraftLineItem[];
  readonly assignments: ReadonlyMap<string, readonly MemberId[]>;
  readonly unassignedItemIds: readonly string[];
  readonly totalAssignedMinor: number;
  readonly totalUnassignedMinor: number;
  readonly totalItemsMinor: number;
}

export function createAssignmentSession(
  groupId: string,
  memberIds: readonly MemberId[],
  items: readonly DraftLineItem[],
): ItemAssignmentSession {
  const assignments = new Map<string, readonly MemberId[]>();
  const unassignedItemIds: string[] = [];
  let totalAssigned = 0;
  let totalUnassigned = 0;
  let totalItems = 0;

  for (const item of items) {
    totalItems += item.totalAmountMinor;
    const assigned = item.assignedMemberIds;
    if (assigned.length === 0) {
      unassignedItemIds.push(item.id as string);
      totalUnassigned += item.totalAmountMinor;
    } else {
      assignments.set(item.id as string, assigned);
      totalAssigned += item.totalAmountMinor;
    }
  }

  return {
    groupId,
    memberIds,
    items,
    assignments,
    unassignedItemIds,
    totalAssignedMinor: totalAssigned,
    totalUnassignedMinor: totalUnassigned,
    totalItemsMinor: totalItems,
  };
}
