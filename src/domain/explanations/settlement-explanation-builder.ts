import type { MemberId } from '@shared-types/index';

import type { Settlement } from '../entities/settlement';

import type { SettlementExplanation } from './explanation-types';

export function buildSettlementExplanations(
  memberId: MemberId,
  settlements: readonly Settlement[],
): readonly SettlementExplanation[] {
  const result: SettlementExplanation[] = [];
  for (const s of settlements) {
    if (s.deletedAt) continue;
    if (s.fromMemberId === memberId) {
      result.push({
        settlementId: s.id as string,
        fromMemberId: s.fromMemberId,
        toMemberId: s.toMemberId,
        amountMinor: s.amountMinor,
        date: s.settlementDate as string,
        impactOnMember: 'reduced_debt',
      });
    } else if (s.toMemberId === memberId) {
      result.push({
        settlementId: s.id as string,
        fromMemberId: s.fromMemberId,
        toMemberId: s.toMemberId,
        amountMinor: s.amountMinor,
        date: s.settlementDate as string,
        impactOnMember: 'reduced_credit',
      });
    }
  }
  return result;
}
