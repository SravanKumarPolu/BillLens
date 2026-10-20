import { asGroupId } from '@domain/entities';
import type { MemberRole } from '@domain/entities/group-member';
import { InvalidEntityError } from '@domain/errors';
import type { GroupMemberRepository } from '@domain/repositories/group-member.repository';
import type { GroupRepository } from '@domain/repositories/group.repository';

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** A member of a group, projected for pickers and member rows. */
export interface GroupMemberView {
  readonly id: string;
  readonly displayName: string;
  readonly role: MemberRole;
  /** True when the member record is linked to a signed-in profile. */
  readonly isRegisteredUser: boolean;
}

export interface ListGroupMembersOutput {
  readonly groupId: string;
  readonly groupName: string;
  readonly currencyCode: string;
  readonly members: readonly GroupMemberView[];
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

/**
 * Use case: list a group's ACTIVE members plus the group's name and
 * default currency.
 *
 * Backs the manual expense form (payer / participant pickers default to
 * the group's currency) and the group home screen's member row. Reads
 * only — no mutation, no sync.
 */
export class ListGroupMembersUseCase {
  constructor(
    private readonly groups: GroupRepository,
    private readonly members: GroupMemberRepository,
  ) {}

  async execute(groupId: string): Promise<ListGroupMembersOutput> {
    const group = await this.groups.findById(asGroupId(groupId));
    if (group === null) {
      throw new InvalidEntityError(`Group ${groupId} not found`);
    }

    const activeMembers = await this.members.listActiveByGroup(asGroupId(groupId));

    return {
      groupId,
      groupName: group.name,
      currencyCode: group.currencyCode as string,
      members: activeMembers.map((m) => ({
        id: m.id as string,
        displayName: m.displayName,
        role: m.role,
        isRegisteredUser: m.userId !== undefined,
      })),
    };
  }
}
