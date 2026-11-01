/**
 * Group editing, archiving, member management and permanent deletion.
 *
 * All operations are local-only. Deletion preserves the audit trail but removes
 * the group's financial rows in one transaction; receipt file paths are returned
 * for best-effort cleanup after the commit.
 */

import type { Group, GroupCategory } from '@domain/entities/group';
import {
  archiveGroup,
  restoreArchivedGroup,
  updateGroup,
} from '@domain/entities/group';
import {
  createGroupMember,
  leaveGroup,
  renameGroupMember,
  type GroupMember,
} from '@domain/entities/group-member';
import type { GroupMemberRepository } from '@domain/repositories/group-member.repository';
import type { GroupRepository } from '@domain/repositories/group.repository';
import type { GroupId, MemberId } from '@shared-types/index';

export interface GroupFinancialCounts {
  readonly expenses: number;
  readonly settlements: number;
}

export interface GroupManagementStore {
  getFinancialCounts(groupId: string): Promise<GroupFinancialCounts>;
  countMemberReferences(groupId: string, memberId: string): Promise<number>;
  countReceiptFiles(groupId: string): Promise<number>;
  deleteGroupCascade(groupId: string): Promise<readonly string[]>;
}

export interface GroupDeletionSummary {
  readonly groupId: string;
  readonly name: string;
  readonly currencyCode: string;
  readonly members: number;
  readonly expenses: number;
  readonly settlements: number;
  readonly receiptFiles: number;
  readonly archived: boolean;
}

export interface UpdateGroupInput {
  readonly groupId: string;
  readonly name: string;
  readonly description?: string;
  readonly category?: GroupCategory;
  readonly icon?: string;
  readonly currencyCode: string;
  readonly expectedVersion: number;
  readonly actorUserId: string;
}

export class GetGroupUseCase {
  constructor(private readonly groups: GroupRepository) {}

  async execute(groupId: string): Promise<Group> {
    const group = await this.groups.findById(groupId as GroupId);
    if (group === null || group.deletedAt !== undefined) throw new Error('Group not found.');
    return group;
  }
}

export class UpdateGroupUseCase {
  constructor(
    private readonly groups: GroupRepository,
    private readonly store: GroupManagementStore,
  ) {}

  async execute(input: UpdateGroupInput): Promise<Group> {
    const current = await this.groups.findById(input.groupId as GroupId);
    if (current === null || current.deletedAt !== undefined) {
      throw new Error('Group not found.');
    }
    if (current.archivedAt !== undefined) {
      throw new Error('Restore this archived group before editing it.');
    }
    if (input.currencyCode !== current.currencyCode) {
      const counts = await this.store.getFinancialCounts(input.groupId);
      if (counts.expenses > 0 || counts.settlements > 0) {
        throw new Error(
          'Currency cannot be changed because this group already has financial records. ' +
            'Create a new group with the desired currency instead.',
        );
      }
    }
    const next = updateGroup(current, {
      name: input.name,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      expectedVersion: (input.expectedVersion ?? current.version) as never,
    });
    const saved: Group = {
      ...next,
      // The domain update does not own currency; set it only after the guard.
      currencyCode: input.currencyCode as Group['currencyCode'],
    };
    await this.groups.save(saved);
    return saved;
  }
}

export class ArchiveGroupUseCase {
  constructor(private readonly groups: GroupRepository) {}

  async execute(groupId: string, expectedVersion: number, now?: string): Promise<Group> {
    const current = await this.groups.findById(groupId as GroupId);
    if (current === null || current.deletedAt !== undefined) throw new Error('Group not found.');
    const next = archiveGroup(current, {
      expectedVersion: expectedVersion as never,
      ...(now !== undefined ? { now: now as never } : {}),
    });
    await this.groups.save(next);
    return next;
  }
}

export class RestoreGroupUseCase {
  constructor(private readonly groups: GroupRepository) {}

  async execute(groupId: string, expectedVersion: number): Promise<Group> {
    const current = await this.groups.findById(groupId as GroupId);
    if (current === null || current.deletedAt !== undefined) throw new Error('Group not found.');
    const next = restoreArchivedGroup(current, { expectedVersion: expectedVersion as never });
    await this.groups.save(next);
    return next;
  }
}

export class GetGroupDeletionSummaryUseCase {
  constructor(
    private readonly groups: GroupRepository,
    private readonly members: GroupMemberRepository,
    private readonly store: GroupManagementStore,
  ) {}

  async execute(groupId: string): Promise<GroupDeletionSummary> {
    const group = await this.groups.findById(groupId as GroupId);
    if (group === null || group.deletedAt !== undefined) throw new Error('Group not found.');
    const [members, counts, receiptFiles] = await Promise.all([
      this.members.listAllByGroup(groupId as GroupId, { limit: 500 }),
      this.store.getFinancialCounts(groupId),
      this.store.countReceiptFiles(groupId),
    ]);
    return {
      groupId,
      name: group.name,
      currencyCode: group.currencyCode as string,
      members: members.items.length,
      expenses: counts.expenses,
      settlements: counts.settlements,
      receiptFiles,
      archived: group.archivedAt !== undefined,
    };
  }
}

export class DeleteGroupUseCase {
  constructor(
    private readonly groups: GroupRepository,
    private readonly store: GroupManagementStore,
    private readonly deleteFile: (uri: string) => Promise<void> = async () => undefined,
  ) {}

  async execute(input: {
    readonly groupId: string;
    readonly confirmationName: string;
    readonly secondConfirmation?: boolean;
  }): Promise<{ deleted: boolean; filesRemoved: number }> {
    const group = await this.groups.findById(input.groupId as GroupId);
    if (group === null || group.deletedAt !== undefined) {
      return { deleted: false, filesRemoved: 0 };
    }
    if (input.confirmationName.trim() !== group.name) {
      throw new Error('Type the exact group name to confirm deletion.');
    }
    const counts = await this.store.getFinancialCounts(input.groupId);
    if ((counts.expenses > 0 || counts.settlements > 0) && input.secondConfirmation !== true) {
      throw new Error('This group has financial records. Confirm permanent deletion again.');
    }

    const receiptUris = await this.store.deleteGroupCascade(input.groupId);
    // Best-effort file cleanup; a missing file is already effectively deleted.
    let filesRemoved = 0;
    for (const uri of receiptUris) {
      try {
        await this.deleteFile(uri);
        filesRemoved += 1;
      } catch {
        // Database deletion already committed; a retry can clean orphans.
      }
    }
    return { deleted: true, filesRemoved };
  }
}

export class AddGroupMemberUseCase {
  constructor(
    private readonly groups: GroupRepository,
    private readonly members: GroupMemberRepository,
    private readonly generateId: () => string,
  ) {}

  async execute(input: {
    readonly groupId: string;
    readonly displayName: string;
    readonly actorUserId: string;
  }): Promise<GroupMember> {
    const group = await this.groups.findById(input.groupId as GroupId);
    if (group === null || group.deletedAt !== undefined) throw new Error('Group not found.');
    if (group.archivedAt !== undefined) throw new Error('Archived groups are read-only.');
    const member = createGroupMember({
      id: this.generateId() as MemberId,
      groupId: group.id,
      displayName: input.displayName,
      role: 'member',
    });
    await this.members.save(member);
    return member;
  }
}

export class RenameGroupMemberUseCase {
  constructor(private readonly members: GroupMemberRepository) {}

  async execute(input: {
    readonly memberId: string;
    readonly displayName: string;
    readonly expectedVersion?: number;
  }): Promise<GroupMember> {
    const current = await this.members.findById(input.memberId as MemberId);
    if (current === null || current.leftAt !== undefined) throw new Error('Member not found.');
    const next = renameGroupMember(current, {
      displayName: input.displayName,
      expectedVersion: (input.expectedVersion ?? current.version) as never,
    });
    await this.members.save(next);
    return next;
  }
}

export class RemoveGroupMemberUseCase {
  constructor(
    private readonly members: GroupMemberRepository,
    private readonly store: GroupManagementStore,
  ) {}

  async execute(input: { readonly memberId: string }): Promise<{ mode: 'deactivated' }> {
    const current = await this.members.findById(input.memberId as MemberId);
    if (current === null || current.leftAt !== undefined) throw new Error('Member not found.');
    if (current.role === 'owner') {
      throw new Error('The group owner cannot be removed. Change ownership first.');
    }
    // Financial history is never deleted: referenced members are deactivated.
    await this.store.countMemberReferences(current.groupId as string, current.id as string);
    const next = leaveGroup(current, { expectedVersion: current.version });
    await this.members.save(next);
    return { mode: 'deactivated' };
  }
}
