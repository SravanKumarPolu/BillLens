/**
 * Group store tests (Prompt 16).
 *
 * Exercises the persisted Zustand store: add, upsert, archive,
 * unarchive, leave, rename, setSyncState, getGroup, reset.
 *
 * The Jest setup mocks AsyncStorage with an in-memory implementation
 * so persistence round-trips work without the native module.
 */

import { beforeEach, describe, expect, it } from '@jest/globals';

import type { GroupSyncState, GroupType, StorageMode } from '@presentation/view-models/groups';
import { useGroupStore, type GroupSummary } from '@store/group-store';

function makeGroup(
  id: string,
  overrides: Partial<GroupSummary> = {},
): GroupSummary {
  return {
    id,
    name: `Group ${id}`,
    currencyCode: 'USD',
    memberCount: 3,
    userBalanceMinor: 0,
    lastActivityLabel: 'Just now',
    archived: false,
    syncState: 'synced',
    groupType: 'General' as GroupType,
    privacyDefault: 'local_only' as StorageMode,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('group store', () => {
  beforeEach(() => {
    useGroupStore.getState().reset();
  });

  describe('default state', () => {
    it('starts with an empty groups list', () => {
      expect(useGroupStore.getState().groups).toEqual([]);
    });
  });

  describe('addGroup', () => {
    it('adds a group at the head of the list', () => {
      useGroupStore.getState().addGroup(makeGroup('g1'));
      useGroupStore.getState().addGroup(makeGroup('g2'));
      const groups = useGroupStore.getState().groups;
      expect(groups.map((g) => g.id)).toEqual(['g2', 'g1']);
    });
  });

  describe('upsertGroup', () => {
    it('inserts when the id is new', () => {
      useGroupStore.getState().upsertGroup(makeGroup('g1'));
      expect(useGroupStore.getState().groups).toHaveLength(1);
    });

    it('replaces the existing group when the id matches', () => {
      useGroupStore.getState().upsertGroup(makeGroup('g1', { name: 'Old' }));
      useGroupStore.getState().upsertGroup(makeGroup('g1', { name: 'New' }));
      const groups = useGroupStore.getState().groups;
      expect(groups).toHaveLength(1);
      expect(groups[0]!.name).toBe('New');
    });
  });

  describe('archiveGroup / unarchiveGroup', () => {
    it('marks the group as archived', () => {
      useGroupStore.getState().addGroup(makeGroup('g1'));
      useGroupStore.getState().archiveGroup('g1');
      expect(useGroupStore.getState().groups[0]!.archived).toBe(true);
    });

    it('restores an archived group', () => {
      useGroupStore.getState().addGroup(makeGroup('g1', { archived: true }));
      useGroupStore.getState().unarchiveGroup('g1');
      expect(useGroupStore.getState().groups[0]!.archived).toBe(false);
    });

    it('is a no-op when the group does not exist', () => {
      useGroupStore.getState().archiveGroup('nonexistent');
      expect(useGroupStore.getState().groups).toEqual([]);
    });
  });

  describe('leaveGroup', () => {
    it('removes the group entirely', () => {
      useGroupStore.getState().addGroup(makeGroup('g1'));
      useGroupStore.getState().addGroup(makeGroup('g2'));
      useGroupStore.getState().leaveGroup('g1');
      expect(useGroupStore.getState().groups.map((g) => g.id)).toEqual(['g2']);
    });
  });

  describe('renameGroup', () => {
    it('updates the name and bumps updatedAt', () => {
      useGroupStore.getState().addGroup(makeGroup('g1', { name: 'Old' }));
      useGroupStore.getState().renameGroup('g1', 'New Name', '2025-01-01T00:00:00.000Z');
      const group = useGroupStore.getState().groups[0]!;
      expect(group.name).toBe('New Name');
      expect(group.updatedAt).toBe('2025-01-01T00:00:00.000Z');
    });

    it('trims whitespace from the new name', () => {
      useGroupStore.getState().addGroup(makeGroup('g1'));
      useGroupStore.getState().renameGroup('g1', '  Trimmed  ');
      expect(useGroupStore.getState().groups[0]!.name).toBe('Trimmed');
    });
  });

  describe('setSyncState', () => {
    it('updates the sync-state marker', () => {
      useGroupStore.getState().addGroup(makeGroup('g1'));
      const next: GroupSyncState = 'pending';
      useGroupStore.getState().setSyncState('g1', next);
      expect(useGroupStore.getState().groups[0]!.syncState).toBe('pending');
    });
  });

  describe('getGroup', () => {
    it('returns the matching group', () => {
      useGroupStore.getState().addGroup(makeGroup('g1', { name: 'Found' }));
      expect(useGroupStore.getState().getGroup('g1')?.name).toBe('Found');
    });

    it('returns undefined when no group matches', () => {
      expect(useGroupStore.getState().getGroup('missing')).toBeUndefined();
    });
  });

  describe('reset', () => {
    it('clears every group', () => {
      useGroupStore.getState().addGroup(makeGroup('g1'));
      useGroupStore.getState().addGroup(makeGroup('g2'));
      useGroupStore.getState().reset();
      expect(useGroupStore.getState().groups).toEqual([]);
    });
  });
});
