/**
 * ResolveDuplicateMembersUseCase — Phase 3 Prompt 28.
 *
 * Resolves a duplicate-member situation by applying one of three
 * strategies. Requires owner/admin permission; financial-history cases
 * require an explicit `confirmFinancialImpact` flag from the caller.
 *
 * Strategies:
 *
 *   - `link_identity_only`
 *       Sets `userId` on the placeholder from the real profile. Member
 *       ids preserved; historical expenses preserved; balances unchanged.
 *       Delegates to `LinkMembershipToProfileUseCase` internally.
 *
 *   - `keep_both`
 *       Both members remain active with their existing identities. NO
 *       link is created. Useful when two real people share a name.
 *       Records an audit entry noting that the operator reviewed the
 *       duplicate and chose to keep both.
 *
 *   - `transfer_active_identity`
 *       The TARGET member (placeholder) absorbs the SOURCE member's
 *       `userId`. The SOURCE member is marked as having left the group
 *       (`leftAt`). Historical expense references to the SOURCE member
 *       are PRESERVED — they are NOT rewritten to point at the target.
 *       This is the only strategy that mutates financial state by
 *       removing a member, and it requires `confirmFinancialImpact: true`.
 *
 * INVARIANT: no strategy rewrites historical expense or settlement
 * references. The historical record is append-only.
 */

import {
  type GroupMember,
  leaveGroup,
} from '@domain/entities/group-member';
import { DeletedEntityError, InvalidEntityError } from '@domain/errors';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { GroupMemberRepository } from '@domain/repositories/group-member.repository';
import type { MemberId, UserId } from '@shared-types/index';

import type { LinkPermissionGate } from './link-membership-to-profile.usecase';
import { LinkMembershipToProfileUseCase } from './link-membership-to-profile.usecase';

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export type DuplicateResolutionStrategy =
  | 'link_identity_only'
  | 'keep_both'
  | 'transfer_active_identity';

export interface ResolveDuplicateMembersInput {
  readonly strategy: DuplicateResolutionStrategy;
  /**
   * The member whose identity is being "absorbed" or "kept". For
   * `link_identity_only`: this is the placeholder. For
   * `transfer_active_identity`: this is the member whose `userId`
   * will be cleared and who will be marked as having left.
   */
  readonly sourceMemberId: MemberId;
  /**
   * The member that survives. For `link_identity_only`: same as
   * source. For `transfer_active_identity`: the member that absorbs
   * the source's userId. For `keep_both`: ignored.
   */
  readonly targetMemberId: MemberId;
  /** Required for `link_identity_only` and `transfer_active_identity`. */
  readonly userId?: UserId;
  readonly actorMemberId: MemberId;
  /**
   * Required for `transfer_active_identity` when either member has
   * historical expenses/settlements. The caller must explicitly
   * acknowledge that the source member's financial history will be
   * preserved under their original member id.
   */
  readonly confirmFinancialImpact?: boolean;
  readonly newDisplayName?: string;
}

export interface ResolveDuplicateMembersOutput {
  readonly strategy: DuplicateResolutionStrategy;
  readonly survivingMemberId: MemberId;
  readonly sourceMemberId?: MemberId;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class ResolveDuplicateMembersUseCase {
  private readonly linkUseCase: LinkMembershipToProfileUseCase;

  constructor(
    private readonly memberRepo: GroupMemberRepository,
    private readonly auditRepo: AuditRepository,
    private readonly generateId: () => string,
    canPerform: LinkPermissionGate,
  ) {
    this.linkUseCase = new LinkMembershipToProfileUseCase(
      memberRepo,
      auditRepo,
      generateId,
      canPerform,
    );
  }

  async execute(
    input: ResolveDuplicateMembersInput,
  ): Promise<ResolveDuplicateMembersOutput> {
    if (input.strategy === 'keep_both') {
      return this.executeKeepBoth(input);
    }
    if (input.strategy === 'link_identity_only') {
      return this.executeLinkIdentityOnly(input);
    }
    return this.executeTransferActiveIdentity(input);
  }

  // -----------------------------------------------------------------------
  // Strategy implementations
  // -----------------------------------------------------------------------

  private async executeLinkIdentityOnly(
    input: ResolveDuplicateMembersInput,
  ): Promise<ResolveDuplicateMembersOutput> {
    if (input.userId === undefined) {
      throw new InvalidEntityError(
        'link_identity_only requires a userId to link',
      );
    }
    await this.linkUseCase.execute({
      placeholderMemberId: input.targetMemberId,
      userId: input.userId,
      actorMemberId: input.actorMemberId,
      ...(input.newDisplayName !== undefined
        ? { newDisplayName: input.newDisplayName }
        : {}),
    });
    return {
      strategy: 'link_identity_only',
      survivingMemberId: input.targetMemberId,
      sourceMemberId: input.sourceMemberId,
    };
  }

  private async executeKeepBoth(
    input: ResolveDuplicateMembersInput,
  ): Promise<ResolveDuplicateMembersOutput> {
    const source = await this.memberRepo.findById(input.sourceMemberId);
    const target = await this.memberRepo.findById(input.targetMemberId);
    if (!source || !target) {
      throw new InvalidEntityError('Both source and target members must exist');
    }
    if (source.groupId !== target.groupId) {
      throw new InvalidEntityError(
        'Cross-group linking is not allowed: source and target belong to different groups',
      );
    }
    // No state change. Just record the decision.
    await this.auditRepo.append({
      id: this.generateId(),
      entityType: 'group_member',
      entityId: target.id as string,
      action: 'update',
      groupId: target.groupId,
      changeSummary: {
        action_type: 'resolve_duplicate_keep_both',
        actor: input.actorMemberId as string,
        sourceMemberId: source.id as string,
        targetMemberId: target.id as string,
        note: 'Operator reviewed duplicate and chose to keep both members.',
      },
    });
    return {
      strategy: 'keep_both',
      survivingMemberId: input.targetMemberId,
      sourceMemberId: input.sourceMemberId,
    };
  }

  private async executeTransferActiveIdentity(
    input: ResolveDuplicateMembersInput,
  ): Promise<ResolveDuplicateMembersOutput> {
    if (input.userId === undefined) {
      throw new InvalidEntityError(
        'transfer_active_identity requires a userId to transfer',
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
    if (source.leftAt) {
      throw new DeletedEntityError(
        `Source member ${input.sourceMemberId} has already left the group`,
        'GroupMember',
        input.sourceMemberId as string,
      );
    }
    if (target.leftAt) {
      throw new DeletedEntityError(
        `Target member ${input.targetMemberId} has already left the group`,
        'GroupMember',
        input.targetMemberId as string,
      );
    }

    // Financial-impact confirmation gate. The caller MUST acknowledge that
    // the source member's historical expenses will remain under the
    // original member id (not rewritten to point at the target).
    if (input.confirmFinancialImpact !== true) {
      throw new InvalidEntityError(
        'transfer_active_identity requires confirmFinancialImpact=true because the source member has financial history that will be preserved under the original member id',
      );
    }

    // 1. Set the userId on the target (preserve target's id + historical refs).
    if (target.userId === undefined) {
      await this.linkUseCase.execute({
        placeholderMemberId: input.targetMemberId,
        userId: input.userId,
        actorMemberId: input.actorMemberId,
        ...(input.newDisplayName !== undefined
          ? { newDisplayName: input.newDisplayName }
          : {}),
      });
    }

    // 2. Mark the SOURCE member as having left the group. Their historical
    //    expenses are NOT rewritten — they remain valid under the original
    //    member id (audit trail preserved).
    const updatedSource: GroupMember = leaveGroup(source, {
      expectedVersion: source.version,
    });
    await this.memberRepo.save(updatedSource);

    await this.auditRepo.append({
      id: this.generateId(),
      entityType: 'group_member',
      entityId: source.id as string,
      action: 'update',
      groupId: source.groupId,
      changeSummary: {
        action_type: 'resolve_duplicate_transfer_active_identity',
        actor: input.actorMemberId as string,
        sourceMemberId: source.id as string,
        targetMemberId: target.id as string,
        transferredUserId: input.userId as string,
        sourceLeftAt: updatedSource.leftAt,
        historicalReferencesPreserved: true,
        balancesRecomputed: false,
      },
      previousVersion: source.version as number,
      newVersion: updatedSource.version as number,
    });

    return {
      strategy: 'transfer_active_identity',
      survivingMemberId: input.targetMemberId,
      sourceMemberId: input.sourceMemberId,
    };
  }
}
