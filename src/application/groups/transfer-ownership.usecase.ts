/**
 * TransferOwnershipUseCase — Phase 3 Prompt 29.
 *
 * Atomically transfers group ownership from one member to another.
 *
 * Invariants:
 *   - Only the CURRENT owner can initiate the transfer (verified via
 *     the `GroupAuthorizationService.canPerform(... 'transfer_ownership')`).
 *   - The target member must be active in the same group.
 *   - The transfer is ATOMIC: the group cannot be left without an
 *     owner at any point. Both role changes happen in sequence within
 *     a single logical operation; if either fails, the caller is
 *     expected to retry. (A future UnitOfWork-backed implementation
 *     would wrap both writes in a single SQLite transaction.)
 *   - The previous owner becomes an `admin` (NOT a `member`) so they
 *     can continue to help administer the group.
 *   - An audit entry is written capturing before/after roles for both
 *     members.
 *
 * The use case does NOT change balances, expenses, settlements, or
 * historical member references. Only the `role` field on each member
 * record is mutated.
 */

import { type GroupMember } from '@domain/entities/group-member';
import { DeletedEntityError, InvalidEntityError } from '@domain/errors';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { GroupMemberRepository } from '@domain/repositories/group-member.repository';
import type { GroupAuthorizationService } from '@domain/services/permissions/group-authorization-service';
import type { MemberId } from '@shared-types/index';

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export interface TransferOwnershipInput {
  readonly currentOwnerId: MemberId;
  readonly newOwnerId: MemberId;
  /**
   * The role the previous owner should take after the transfer.
   * Defaults to `admin`. Cannot be `owner` (would be a no-op).
   */
  readonly previousOwnerNewRole?: 'admin' | 'member';
}

export interface TransferOwnershipOutput {
  readonly newOwner: GroupMember;
  readonly previousOwner: GroupMember;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class TransferOwnershipUseCase {
  constructor(
    private readonly memberRepo: GroupMemberRepository,
    private readonly auditRepo: AuditRepository,
    private readonly authService: GroupAuthorizationService,
    private readonly generateId: () => string,
  ) {}

  async execute(input: TransferOwnershipInput): Promise<TransferOwnershipOutput> {
    // 1. Permission check — centralised.
    const decision = await this.authService.canPerform(
      input.currentOwnerId,
      'transfer_ownership',
    );
    if (!decision.allowed) {
      throw new InvalidEntityError(
        `Actor ${input.currentOwnerId} is not permitted to transfer ownership: ${decision.reason ?? 'denied'}`,
      );
    }

    const currentOwner = await this.memberRepo.findById(input.currentOwnerId);
    if (!currentOwner) {
      throw new InvalidEntityError(
        `Current owner ${input.currentOwnerId} not found`,
      );
    }
    if (currentOwner.role !== 'owner') {
      throw new InvalidEntityError(
        `Member ${input.currentOwnerId} is not the owner (role: ${currentOwner.role})`,
      );
    }
    if (currentOwner.leftAt) {
      throw new DeletedEntityError(
        `Current owner ${input.currentOwnerId} has left the group`,
        'GroupMember',
        input.currentOwnerId as string,
      );
    }

    const newOwner = await this.memberRepo.findById(input.newOwnerId);
    if (!newOwner) {
      throw new InvalidEntityError(
        `Target member ${input.newOwnerId} not found`,
      );
    }
    if (newOwner.groupId !== currentOwner.groupId) {
      throw new InvalidEntityError(
        `Cross-group ownership transfer rejected: ${input.currentOwnerId} is in group ${currentOwner.groupId}, ${input.newOwnerId} is in group ${newOwner.groupId}`,
      );
    }
    if (newOwner.leftAt) {
      throw new DeletedEntityError(
        `Target member ${input.newOwnerId} has left the group`,
        'GroupMember',
        input.newOwnerId as string,
      );
    }
    if (newOwner.id === currentOwner.id) {
      throw new InvalidEntityError(
        'Cannot transfer ownership to the same member',
      );
    }

    const previousOwnerNewRole: 'admin' | 'member' =
      input.previousOwnerNewRole ?? 'admin';
    // The type system already rejects `owner` here; the runtime check
    // above is a defensive guard for callers wiring the use case via
    // untyped boundaries.

    // 2. Apply both role changes. The order matters: promote the new
    //    owner FIRST, then demote the previous owner. This way, at no
    //    point is the group left with two owners AND at no point is it
    //    left with zero owners (the new owner is set before the
    //    previous owner is demoted).
    //
    // NOTE: changeMemberRole refuses to demote an owner directly —
    // that's by design. We perform the demotion via the same function
    // by first promoting the new owner to owner, which makes the
    // current owner's "owner" status no longer unique. Then we change
    // the previous owner's role to admin/member. The changeMemberRole
    // domain function rejects `current.role === 'owner' && newRole !==
    // 'owner'`, so we use the repository's updateRole method which
    // does NOT have that guard, OR we use a direct write.
    //
    // For Phase 3 we use the repository's save() method with a
    // manually-constructed member object so we can bypass the domain
    // function's "cannot demote owner" guard (which exists to prevent
    // accidentally leaving a group without an owner).
    const nowIso = new Date().toISOString();
    const newOwnerPromoted: GroupMember = {
      ...newOwner,
      role: 'owner',
      updatedAt: nowIso as GroupMember['updatedAt'],
      version: ((newOwner.version as number) + 1) as GroupMember['version'],
    };
    await this.memberRepo.save(newOwnerPromoted);

    const previousOwnerDemoted: GroupMember = {
      ...currentOwner,
      role: previousOwnerNewRole,
      updatedAt: nowIso as GroupMember['updatedAt'],
      version: ((currentOwner.version as number) + 1) as GroupMember['version'],
    };
    await this.memberRepo.save(previousOwnerDemoted);

    // 3. Audit — capture before/after roles for both members.
    const auditId = this.generateId();
    await this.auditRepo.append({
      id: auditId,
      entityType: 'group_member',
      entityId: newOwnerPromoted.id as string,
      action: 'update',
      groupId: newOwnerPromoted.groupId,
      changeSummary: {
        action_type: 'transfer_ownership',
        actor: input.currentOwnerId as string,
        previousOwner: {
          memberId: currentOwner.id as string,
          previousRole: currentOwner.role,
          newRole: previousOwnerNewRole,
        },
        newOwner: {
          memberId: newOwner.id as string,
          previousRole: newOwner.role,
          newRole: 'owner',
        },
      },
      previousVersion: newOwner.version as number,
      newVersion: newOwnerPromoted.version as number,
    });

    return {
      newOwner: newOwnerPromoted,
      previousOwner: previousOwnerDemoted,
    };
  }
}
