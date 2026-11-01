import {
  asGroupId,
  asMemberId,
  asUserId,
  createGroup,
  createGroupMember,
} from '@domain/entities';
import { InvalidEntityError } from '@domain/errors';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { GroupMemberRepository } from '@domain/repositories/group-member.repository';
import type { GroupRepository } from '@domain/repositories/group.repository';
import type { DateTime } from '@domain/value-objects';
import { nowDateTime } from '@domain/value-objects';

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export interface CreateGroupInput {
  /** Client-generated group id. Retry with the same id is idempotent. */
  readonly groupId: string;
  readonly name: string;
  readonly currencyCode: string;
  /** Optional description (≤ 500 chars). */
  readonly description?: string;
  /**
   * The id of the user creating the group. Pre-identity this is the
   * synthetic 'local-user' id; post-identity it is the signed-in
   * user's id. The owner member's `userId` is set to this value so
   * the dashboard can find "my member" per group.
   */
  readonly createdBy: string;
  /** Client-generated owner member id. */
  readonly ownerMemberId: string;
  readonly now?: DateTime;
}

export interface CreateGroupOutput {
  readonly groupId: string;
  readonly ownerId: string;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

/**
 * Use case: create a new group + its owner member atomically.
 *
 * The group + owner member are persisted to the SQLite repository in
 * separate calls (the group repository does not enforce atomicity
 * across tables — the application layer is responsible). The audit
 * log entry is appended after both writes succeed.
 *
 * Idempotent on `groupId`: retrying with the same id after a network
 * failure is safe — the repository's upsert semantics make the retry
 * a no-op rather than a duplicate.
 *
 * The owner member's `userId` is set to `input.createdBy` so the
 * dashboard can find "my member" per group as the member whose
 * `userId === createdBy`. Pre-identity this is the synthetic
 * 'local-user' id; post-identity it is the signed-in user's id.
 */
export class CreateGroupUseCase {
  constructor(
    private readonly groups: GroupRepository,
    private readonly members: GroupMemberRepository,
    private readonly audit: AuditRepository,
  ) {}

  async execute(input: CreateGroupInput): Promise<CreateGroupOutput> {
    if (input.name.trim().length === 0) {
      throw new InvalidEntityError('Group name is required.');
    }
    if (input.currencyCode.trim().length === 0) {
      throw new InvalidEntityError('Currency code is required.');
    }
    if (input.createdBy.trim().length === 0) {
      throw new InvalidEntityError('createdBy is required.');
    }

    const now = input.now ?? nowDateTime();
    const groupId = asGroupId(input.groupId);
    const ownerMemberId = asMemberId(input.ownerMemberId);
    const createdBy = asUserId(input.createdBy);

    // 1. Save the group.
    const group = createGroup({
      id: groupId,
      name: input.name.trim(),
      currencyCode: input.currencyCode,
      ...(input.description !== undefined ? { description: input.description } : {}),
      createdBy,
      now,
    });
    await this.groups.save(group);

    // 2. Save the owner member (linked to the creating user).
    const owner = createGroupMember({
      id: ownerMemberId,
      groupId,
      userId: createdBy,
      displayName: 'Owner',
      role: 'owner',
      now,
    });
    await this.members.save(owner);

    // 3. Append the audit-log entry.
    await this.audit.append({
      id: generateId(),
      entityType: 'group',
      entityId: groupId as string,
      action: 'create',
      actorId: createdBy,
      groupId,
      newVersion: group.version as number,
      changeSummary: {
        name: group.name,
        currencyCode: group.currencyCode as string,
        ownerMemberId: ownerMemberId as string,
      },
    });

    return {
      groupId: groupId as string,
      ownerId: ownerMemberId as string,
    };
  }
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
