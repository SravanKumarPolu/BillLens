import type { GroupId, MemberId, UserId } from '@shared-types/index';

import { DeletedEntityError, VersionConflictError } from '../errors/index';
import {
  type DateTime,
  type DisplayName,
  type VersionNumber,
  asDateTime,
  asDisplayName,
  asVersionNumber,
  initialVersionNumber,
  nowDateTime,
} from '../value-objects/index';


export function asMemberId(value: string): MemberId {
  return value as MemberId;
}

export type MemberRole = 'owner' | 'admin' | 'member';

export interface GroupMember {
  readonly id: MemberId;
  readonly groupId: GroupId;
  /** May be undefined for guests / invited-but-not-joined members. */
  readonly userId?: UserId;
  readonly displayName: DisplayName;
  readonly role: MemberRole;
  readonly joinedAt: DateTime;
  readonly updatedAt: DateTime;
  readonly leftAt?: DateTime;
  readonly version: VersionNumber;
}

export interface GroupMemberCreateInput {
  readonly id: MemberId;
  readonly groupId: GroupId;
  readonly userId?: UserId;
  readonly displayName: string;
  readonly role: MemberRole;
  readonly now?: DateTime;
}

export function createGroupMember(input: GroupMemberCreateInput): GroupMember {
  const now = input.now ?? nowDateTime();
  return {
    id: input.id,
    groupId: input.groupId,
    ...(input.userId !== undefined ? { userId: input.userId } : {}),
    displayName: asDisplayName(input.displayName),
    role: input.role,
    joinedAt: asDateTime(now),
    updatedAt: asDateTime(now),
    version: initialVersionNumber(),
  };
}

export interface GroupMemberLeaveInput {
  readonly now?: DateTime;
  readonly expectedVersion: VersionNumber;
}

/**
 * Mark a member as having left the group.
 *
 * IMPORTANT: This is a soft-delete — the member record is preserved for
 * historical expense references. The member's `leftAt` is set; from that
 * point on, the member cannot be newly assigned to expenses (but their
 * historical expenses remain valid).
 */
export function leaveGroup(current: GroupMember, input: GroupMemberLeaveInput): GroupMember {
  if (current.version !== input.expectedVersion) {
    throw new VersionConflictError(
      `GroupMember version conflict: expected ${input.expectedVersion}, got ${current.version}`,
      input.expectedVersion as number,
      current.version as number,
    );
  }
  if (current.leftAt) {
    throw new DeletedEntityError(
      `Member ${current.id} has already left group ${current.groupId}`,
      'GroupMember',
      current.id,
    );
  }
  const now = input.now ?? nowDateTime();
  return {
    ...current,
    leftAt: asDateTime(now),
    updatedAt: asDateTime(now),
    version: asVersionNumber(current.version + 1),
  };
}

export interface GroupMemberRoleChangeInput {
  readonly newRole: MemberRole;
  readonly now?: DateTime;
  readonly expectedVersion: VersionNumber;
}

export function changeMemberRole(
  current: GroupMember,
  input: GroupMemberRoleChangeInput,
): GroupMember {
  if (current.version !== input.expectedVersion) {
    throw new VersionConflictError(
      `GroupMember version conflict: expected ${input.expectedVersion}, got ${current.version}`,
      input.expectedVersion as number,
      current.version as number,
    );
  }
  if (current.leftAt) {
    throw new DeletedEntityError(
      `Cannot change role of member ${current.id} who has left group ${current.groupId}`,
      'GroupMember',
      current.id,
    );
  }
  if (current.role === 'owner' && input.newRole !== 'owner') {
    throw new Error(
      `Cannot demote owner ${current.id}. Transfer ownership first.`,
    );
  }
  const now = input.now ?? nowDateTime();
  return {
    ...current,
    role: input.newRole,
    updatedAt: asDateTime(now),
    version: asVersionNumber(current.version + 1),
  };
}

export function isMemberActive(member: GroupMember): boolean {
  return member.leftAt === undefined;
}

/**
 * Returns true if `member` was an active participant at the time of
 * `asOf`. Used to validate that an expense's participants were all
 * members of the group at the time the expense was created.
 */
export function wasMemberActiveAt(member: GroupMember, asOf: DateTime): boolean {
  if (member.joinedAt > asOf) return false;
  if (member.leftAt && member.leftAt <= asOf) return false;
  return true;
}

export interface GroupMemberRenameInput {
  readonly displayName: string;
  readonly now?: DateTime;
  readonly expectedVersion: VersionNumber;
}

export function renameGroupMember(current: GroupMember, input: GroupMemberRenameInput): GroupMember {
  if (current.version !== input.expectedVersion) {
    throw new VersionConflictError(
      `GroupMember version conflict: expected ${input.expectedVersion}, got ${current.version}`,
      input.expectedVersion as number,
      current.version as number,
    );
  }
  if (current.leftAt) {
    throw new DeletedEntityError(
      `Member ${current.id} has left group ${current.groupId}`,
      'GroupMember',
      current.id,
    );
  }
  const now = input.now ?? nowDateTime();
  return {
    ...current,
    displayName: asDisplayName(input.displayName),
    updatedAt: asDateTime(now),
    version: asVersionNumber(current.version + 1),
  };
}
