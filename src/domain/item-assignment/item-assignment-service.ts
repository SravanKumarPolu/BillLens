import type { MemberId } from '@shared-types/index';

import type { DraftLineItem } from '../entities/draft-line-item';
import { InvalidEntityError } from '../errors/index';

import type { ItemAssignmentSession } from './item-assignment-session';
import { createAssignmentSession } from './item-assignment-session';

/**
 * Assign a single item to a single member.
 */
export function assignItem(
  session: ItemAssignmentSession,
  itemId: string,
  memberId: MemberId,
): ItemAssignmentSession {
  return assignItemToMembers(session, itemId, [memberId]);
}

/**
 * Assign an item to multiple members (split equally among them).
 */
export function assignItemToMembers(
  session: ItemAssignmentSession,
  itemId: string,
  memberIds: readonly MemberId[],
): ItemAssignmentSession {
  if (memberIds.length === 0) {
    throw new InvalidEntityError('Cannot assign item to empty member list');
  }
  // Validate all members exist in the session
  const sessionMemberSet = new Set(session.memberIds.map((m) => m as string));
  for (const m of memberIds) {
    if (!sessionMemberSet.has(m as string)) {
      throw new InvalidEntityError(`Member ${m} not in session`);
    }
  }
  // Find the item and update its assignment
  const newItems: DraftLineItem[] = session.items.map((item) => {
    if ((item.id as string) === itemId) {
      return { ...item, assignedMemberIds: memberIds };
    }
    return item;
  });
  return createAssignmentSession(session.groupId, session.memberIds, newItems);
}

/**
 * Split selected items equally among all members.
 */
export function splitItemsEqually(
  session: ItemAssignmentSession,
  itemIds: readonly string[],
): ItemAssignmentSession {
  const itemIdSet = new Set(itemIds);
  const newItems: DraftLineItem[] = session.items.map((item) => {
    if (itemIdSet.has(item.id as string)) {
      return { ...item, assignedMemberIds: session.memberIds };
    }
    return item;
  });
  return createAssignmentSession(session.groupId, session.memberIds, newItems);
}

/**
 * Assign all unassigned items to a single member.
 */
export function assignAllUnassigned(
  session: ItemAssignmentSession,
  memberId: MemberId,
): ItemAssignmentSession {
  const unassignedSet = new Set(session.unassignedItemIds);
  const newItems: DraftLineItem[] = session.items.map((item) => {
    if (unassignedSet.has(item.id as string)) {
      return { ...item, assignedMemberIds: [memberId] };
    }
    return item;
  });
  return createAssignmentSession(session.groupId, session.memberIds, newItems);
}

/**
 * Copy assignment from one item to another (for similar items).
 */
export function copyAssignment(
  session: ItemAssignmentSession,
  fromItemId: string,
  toItemId: string,
): ItemAssignmentSession {
  const fromItem = session.items.find((i) => (i.id as string) === fromItemId);
  if (!fromItem) {
    throw new InvalidEntityError(`Source item ${fromItemId} not found`);
  }
  return assignItemToMembers(session, toItemId, fromItem.assignedMemberIds);
}

/**
 * Undo assignment for an item (make it unassigned).
 */
export function unassignItem(
  session: ItemAssignmentSession,
  itemId: string,
): ItemAssignmentSession {
  const newItems: DraftLineItem[] = session.items.map((item) => {
    if ((item.id as string) === itemId) {
      return { ...item, assignedMemberIds: [] };
    }
    return item;
  });
  return createAssignmentSession(session.groupId, session.memberIds, newItems);
}
