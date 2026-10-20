import type { GroupId, InviteId, InviteToken, MemberId } from '@shared-types/index';

import type { GroupInvite } from '../entities/group-invite';

import type { DeleteMetadata, SoftDeleteResult } from './repository-contracts';

/**
 * Repository for the `GroupInvite` entity.
 *
 * Invites are NOT soft-deleted — they have an explicit status enum
 * (`pending`, `accepted`, `revoked`, `expired`). The `revoke` method
 * transitions an invite from `pending` to `revoked`.
 *
 * SECURITY: cloud storage MUST look invites up by `tokenHash`, not by
 * the raw `token`. The raw token is returned from the create-invite use
 * case ONLY to be displayed once and shared out-of-band; it must never
 * be persisted in a cloud-readable form. The legacy `findByToken`
 * method remains for the local-SQLite path.
 */
export interface GroupInviteRepository {
  findById(id: InviteId): Promise<GroupInvite | null>;
  findByToken(token: InviteToken): Promise<GroupInvite | null>;
  /** Cloud-safe lookup: hash the token and look up by `tokenHash`. */
  findByTokenHash(tokenHash: string): Promise<GroupInvite | null>;
  /** List all pending invites for a group. */
  listPendingByGroup(groupId: GroupId): Promise<readonly GroupInvite[]>;
  /** List all invites (any status) for a group, paginated. */
  listByGroup(groupId: GroupId): Promise<readonly GroupInvite[]>;
  save(invite: GroupInvite): Promise<void>;
  /** Transition an invite from `pending` to `accepted`. */
  accept(id: InviteId, acceptingMemberId: MemberId): Promise<GroupInvite>;
  /** Transition an invite from `pending` to `revoked`. */
  revoke(id: InviteId): Promise<GroupInvite>;
  /** Permanently delete an invite record (only for accepted/revoked/expired). */
  hardDelete(id: InviteId, metadata: DeleteMetadata): Promise<SoftDeleteResult>;
}
