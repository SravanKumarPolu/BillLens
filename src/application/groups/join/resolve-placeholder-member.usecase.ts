/**
 * ResolvePlaceholderMemberUseCase — Phase 3 Prompt 27.
 *
 * When a guest joins a group via an invite and the join-group use case
 * detects an existing "placeholder" member with the same display name
 * (e.g. someone manually added "Rahul" before Rahul actually joined),
 * this use case LINKS the placeholder to the joining user's identity
 * rather than creating a duplicate member record.
 *
 * IMPORTANT: this is an IDENTITY-LINK operation, NOT a financial merge.
 *   - The placeholder member's `id` is preserved — historical expense
 *     references (ExpensePayer.memberId, ExpenseSplit.memberId,
 *     Settlement.fromMemberId / toMemberId) remain valid.
 *   - Only the `userId` field on the placeholder is updated to point at
 *     the joining profile. The `displayName` MAY be updated to the
 *     joining user's preferred display name; if so, the old name is
 *     recorded in an audit entry so historical context is recoverable.
 *   - Financial totals (balances, settlement history) are NOT recomputed.
 *
 * Confirmation:
 *   The use case requires the caller to pass an explicit
 *   `confirmedPlaceholderId` matching one of the candidates returned by
 *   the join-group use case. This prevents accidental linking when
 *   multiple placeholders exist.
 */

import {
  type GroupMember,
} from '@domain/entities/group-member';
import { DeletedEntityError, InvalidEntityError } from '@domain/errors';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { GroupMemberRepository } from '@domain/repositories/group-member.repository';
import type { MemberId, UserId } from '@shared-types/index';

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export interface ResolvePlaceholderInput {
  /** The placeholder member the caller wants to link. */
  readonly placeholderMemberId: MemberId;
  /**
   * The joining user's identity. For guest identities, `userId` may be
   * undefined — in that case only the display name is updated.
   */
  readonly userId?: UserId;
  /** Optional new display name (e.g. the joining user's preferred name). */
  readonly newDisplayName?: string;
  /**
   * The list of placeholder candidate ids returned by the join-group
   * use case. The `placeholderMemberId` MUST appear in this list —
   * this is the explicit confirmation gate.
   */
  readonly confirmedCandidateIds: readonly MemberId[];
}

export interface ResolvePlaceholderOutput {
  readonly member: GroupMember;
  readonly previousDisplayName: string;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class ResolvePlaceholderMemberUseCase {
  constructor(
    private readonly memberRepo: GroupMemberRepository,
    private readonly auditRepo: AuditRepository,
    private readonly generateId: () => string,
  ) {}

  async execute(input: ResolvePlaceholderInput): Promise<ResolvePlaceholderOutput> {
    // 1. Explicit confirmation gate.
    if (!input.confirmedCandidateIds.includes(input.placeholderMemberId)) {
      throw new InvalidEntityError(
        'Placeholder member id was not in the confirmed candidate list — explicit confirmation required',
      );
    }

    const placeholder = await this.memberRepo.findById(input.placeholderMemberId);
    if (!placeholder) {
      throw new InvalidEntityError(
        `Placeholder member ${input.placeholderMemberId} not found`,
      );
    }
    if (placeholder.leftAt) {
      throw new DeletedEntityError(
        `Placeholder member ${input.placeholderMemberId} has left the group and cannot be linked`,
        'GroupMember',
        input.placeholderMemberId as string,
      );
    }
    if (placeholder.userId !== undefined) {
      throw new InvalidEntityError(
        `Member ${input.placeholderMemberId} is already linked to a profile — call UnlinkIncorrectIdentityUseCase first`,
      );
    }

    const previousDisplayName = placeholder.displayName as string;
    const nowIso = new Date().toISOString();

    const updated: GroupMember = {
      ...placeholder,
      ...(input.userId !== undefined ? { userId: input.userId } : {}),
      ...(input.newDisplayName !== undefined
        ? { displayName: input.newDisplayName as GroupMember['displayName'] }
        : {}),
      updatedAt: nowIso as GroupMember['updatedAt'],
      version: ((placeholder.version as number) + 1) as GroupMember['version'],
    };

    await this.memberRepo.save(updated);

    // Audit: capture before/after identity mapping so the link is
    // reversible via UnlinkIncorrectIdentityUseCase.
    await this.auditRepo.append({
      id: this.generateId(),
      entityType: 'group_member',
      entityId: updated.id as string,
      action: 'update',
      groupId: updated.groupId,
      changeSummary: {
        action_type: 'link_placeholder_to_profile',
        previous: {
          userId: null,
          displayName: previousDisplayName,
        },
        next: {
          userId: input.userId ? (input.userId as string) : null,
          displayName: (updated.displayName as string),
        },
        // Preserve the original member id so historical expense references
        // remain valid. This is recorded explicitly so the unlink use
        // case can prove the link never rewrote financial history.
        memberIdPreserved: true,
      },
      previousVersion: placeholder.version as number,
      newVersion: updated.version as number,
    });

    return { member: updated, previousDisplayName };
  }
}
