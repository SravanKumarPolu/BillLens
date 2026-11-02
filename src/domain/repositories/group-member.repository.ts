import type { GroupId, MemberId, UserId } from '@shared-types/index';

import type { GroupMember, MemberRole } from '../entities/group-member';

import type { DeleteMetadata, PaginatedResult, Pagination, SoftDeleteResult } from './repository-contracts';

/**
 * Repository for the `GroupMember` entity.
 *
 * Members are soft-deleted via `leaveGroup` (sets `leftAt`). The
 * repository's `softDelete` method is the storage-layer equivalent.
 */
export interface GroupMemberRepository {
  findById(id: MemberId): Promise<GroupMember | null>;
  /** Returns the active member record for a user in a group, or null. */
  findActiveByGroupAndUser(groupId: GroupId, userId: UserId): Promise<GroupMember | null>;
  /** Returns all active members of a group (excludes leftAt-set records). */
  listActiveByGroup(groupId: GroupId): Promise<readonly GroupMember[]>;
  /** Returns ALL members of a group (active + historical), for balance history. */
  listAllByGroup(groupId: GroupId, pagination: Pagination): Promise<PaginatedResult<GroupMember>>;
  /** Returns the active owner of a group, or null if group has no owner. */
  findActiveOwner(groupId: GroupId): Promise<GroupMember | null>;
  /** Update a member's role (e.g. promote to admin). */
  updateRole(id: MemberId, newRole: MemberRole): Promise<GroupMember>;
  save(member: GroupMember): Promise<void>;
  softDelete(id: MemberId, metadata: DeleteMetadata): Promise<SoftDeleteResult>;
}
