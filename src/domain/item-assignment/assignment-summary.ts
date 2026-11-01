import type { MemberId } from '@shared-types/index';

import type { DraftCharge } from '../entities/draft-charge';

import type { ItemAssignmentSession } from './item-assignment-session';

export interface MemberAssignmentSummary {
  readonly memberId: MemberId;
  readonly itemCount: number;
  readonly itemsTotalMinor: number;
  readonly chargesShareMinor: number;
  readonly grandTotalMinor: number;
}

export function computeAssignmentSummary(
  session: ItemAssignmentSession,
  charges: readonly DraftCharge[],
): readonly MemberAssignmentSummary[] {
  const memberItemTotals = new Map<string, { count: number; total: number }>();
  for (const member of session.memberIds) {
    memberItemTotals.set(member as string, { count: 0, total: 0 });
  }

  for (const item of session.items) {
    const assigned = item.assignedMemberIds;
    if (assigned.length === 0) continue;
    const perMember = Math.floor(item.totalAmountMinor / assigned.length);
    const remainder = item.totalAmountMinor - perMember * assigned.length;
    assigned.forEach((memberId, i) => {
      const entry = memberItemTotals.get(memberId as string);
      if (entry) {
        entry.count += 1;
        entry.total += perMember + (i < remainder ? 1 : 0);
      }
    });
  }

  const totalCharges = charges.reduce((acc, c) => acc + c.amountMinor, 0);
  const totalAssigned = session.totalAssignedMinor;
  const memberCount = session.memberIds.length;

  return session.memberIds.map((memberId) => {
    const key = memberId as string;
    const itemData = memberItemTotals.get(key) ?? { count: 0, total: 0 };
    const chargesShare =
      totalAssigned > 0
        ? Math.floor((totalCharges * itemData.total) / totalAssigned)
        : Math.floor(totalCharges / memberCount);
    return {
      memberId,
      itemCount: itemData.count,
      itemsTotalMinor: itemData.total,
      chargesShareMinor: chargesShare,
      grandTotalMinor: itemData.total + chargesShare,
    };
  });
}
