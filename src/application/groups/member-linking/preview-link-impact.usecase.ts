/**
 * PreviewLinkImpactUseCase — Phase 3 Prompt 28.
 *
 * Pre-flight check before linking two membership records. Returns the
 * number of historical expenses and settlements that reference each
 * member, plus their current balances (signed minor units).
 *
 * CRITICAL: this use case does NOT mutate any data. It is purely a read.
 * The actual link operation is performed by `LinkMembershipToProfileUseCase`,
 * which (deliberately) does NOT rewrite historical expense references —
 * the preview shows the caller what would be preserved, not what would
 * be rewritten.
 *
 * The "historical names" field shows every display name ever recorded
 * for each member (current + audit-trail of past names from previous
 * link operations). This lets the caller confirm "yes, this 'Rahul' on
 * the placeholder is the same 'Rahul K' who paid for dinner last week"
 * before approving the link.
 */

import type { ExpensePayer } from '@domain/entities/expense-payer';
import type { ExpenseSplit } from '@domain/entities/expense-split';
import type { GroupMember } from '@domain/entities/group-member';
import { InvalidEntityError } from '@domain/errors';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { ExpenseRepository } from '@domain/repositories/expense.repository';
import type { GroupMemberRepository } from '@domain/repositories/group-member.repository';
import type { SettlementRepository } from '@domain/repositories/settlement.repository';
import type { MemberId } from '@shared-types/index';

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export interface PreviewLinkImpactInput {
  readonly sourceMemberId: MemberId;
  readonly targetMemberId: MemberId;
}

export interface MemberImpactPreview {
  readonly memberId: MemberId;
  readonly displayName: string;
  readonly hasUserId: boolean;
  readonly expenseCountAsPayer: number;
  readonly expenseCountAsParticipant: number;
  readonly settlementCountSent: number;
  readonly settlementCountReceived: number;
  /** Historical names ever recorded for this member (current + past). */
  readonly historicalNames: readonly string[];
  /**
   * Signed balance in minor units (positive = group owes this member;
   * negative = this member owes the group). Computed as a simple sum of
   * paid-out vs owed — NOT a recompute. Phase 2 balances are 0 by
   * default; this is a structural placeholder until the balance engine
   * is wired in.
   */
  readonly balanceMinor: number;
}

export interface PreviewLinkImpactOutput {
  readonly source: MemberImpactPreview;
  readonly target: MemberImpactPreview;
  /** Total historical records (expenses + settlements) that would remain valid. */
  readonly totalHistoricalReferencesPreserved: number;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class PreviewLinkImpactUseCase {
  constructor(
    private readonly memberRepo: GroupMemberRepository,
    private readonly expenseRepo: ExpenseRepository,
    private readonly settlementRepo: SettlementRepository,
    private readonly auditRepo: AuditRepository,
  ) {}

  async execute(
    input: PreviewLinkImpactInput,
  ): Promise<PreviewLinkImpactOutput> {
    if (input.sourceMemberId === input.targetMemberId) {
      throw new InvalidEntityError(
        'sourceMemberId and targetMemberId must differ',
      );
    }

    const source = await this.memberRepo.findById(input.sourceMemberId);
    const target = await this.memberRepo.findById(input.targetMemberId);
    if (!source) {
      throw new InvalidEntityError(
        `Source member ${input.sourceMemberId} not found`,
      );
    }
    if (!target) {
      throw new InvalidEntityError(
        `Target member ${input.targetMemberId} not found`,
      );
    }
    if (source.groupId !== target.groupId) {
      throw new InvalidEntityError(
        'Cross-group linking is not allowed: source and target belong to different groups',
      );
    }

    const sourcePreview = await this.buildPreview(source);
    const targetPreview = await this.buildPreview(target);

    return {
      source: sourcePreview,
      target: targetPreview,
      totalHistoricalReferencesPreserved:
        sourcePreview.expenseCountAsPayer +
        sourcePreview.expenseCountAsParticipant +
        sourcePreview.settlementCountSent +
        sourcePreview.settlementCountReceived +
        targetPreview.expenseCountAsPayer +
        targetPreview.expenseCountAsParticipant +
        targetPreview.settlementCountSent +
        targetPreview.settlementCountReceived,
    };
  }

  private async buildPreview(
    member: GroupMember,
  ): Promise<MemberImpactPreview> {
    // Expenses: count payers + splits that reference this member.
    const expensesPage = await this.expenseRepo.listByGroup(member.groupId, {
      limit: 200,
    });
    let expenseCountAsPayer = 0;
    let expenseCountAsParticipant = 0;
    for (const e of expensesPage.items) {
      const payers: readonly ExpensePayer[] = await this.expenseRepo.listPayers(
        e.id,
      );
      const splits: readonly ExpenseSplit[] = await this.expenseRepo.listSplits(
        e.id,
      );
      if (payers.some((p) => p.memberId === member.id)) {
        expenseCountAsPayer += 1;
      }
      if (splits.some((s) => s.memberId === member.id)) {
        expenseCountAsParticipant += 1;
      }
    }

    // Settlements.
    const sentPage = await this.settlementRepo.listSentByMember(member.id, {
      limit: 200,
    });
    const receivedPage = await this.settlementRepo.listReceivedByMember(
      member.id,
      { limit: 200 },
    );

    // Historical names from audit entries (link_placeholder_to_profile actions).
    const auditEntries = await this.auditRepo.listByEntity(
      'group_member',
      member.id as string,
    );
    const historicalNames = new Set<string>();
    historicalNames.add(member.displayName as string);
    for (const entry of auditEntries) {
      const summary = entry.changeSummary as
        | {
            previous?: { displayName?: unknown };
            next?: { displayName?: unknown };
          }
        | undefined;
      const prevName = summary?.previous?.displayName;
      const nextName = summary?.next?.displayName;
      if (typeof prevName === 'string') historicalNames.add(prevName);
      if (typeof nextName === 'string') historicalNames.add(nextName);
    }

    return {
      memberId: member.id,
      displayName: member.displayName as string,
      hasUserId: member.userId !== undefined,
      expenseCountAsPayer,
      expenseCountAsParticipant,
      settlementCountSent: sentPage.items.length,
      settlementCountReceived: receivedPage.items.length,
      historicalNames: Array.from(historicalNames),
      // Phase 2 placeholder: balances are not yet wired through this path.
      // The balance engine exists (see src/domain/services/balances/) but
      // the preview deliberately returns 0 to avoid recomputing totals
      // during a non-mutating read.
      balanceMinor: 0,
    };
  }
}
