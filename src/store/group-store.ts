/**
 * Group store.
 *
 * Holds the user's groups as a list of `GroupSummary` records. Persisted
 * to AsyncStorage because group membership is UI-state that the app needs
 * to render instantly on launch — the durable financial data lives in
 * SQLite, but the list of "groups I belong to" is small, low-stakes, and
 * safe to round-trip through persisted UI state.
 *
 * Phase 2: the store starts empty. The New Group form writes new groups
 * here; the Groups List tab reads from here. A later prompt wires this
 * store to the SQLite group repository so it becomes a write-through
 * cache of the real data.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { GroupSyncState, GroupType, StorageMode } from '@presentation/view-models/groups';

const GROUP_STORAGE_KEY = 'billlens.group-state';

/**
 * A summary of a group the user belongs to. Mirrors the fields the
 * Groups List card needs — it is NOT the full domain `Group` entity.
 */
export interface GroupSummary {
  readonly id: string;
  readonly name: string;
  readonly currencyCode: string;
  readonly memberCount: number;
  /** Negative = the user owes the group; positive = group owes the user. */
  readonly userBalanceMinor: number;
  /** Pre-formatted relative label, e.g. "2 days ago". */
  readonly lastActivityLabel: string;
  readonly archived: boolean;
  readonly syncState: GroupSyncState;
  readonly groupType: GroupType;
  readonly privacyDefault: StorageMode;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface GroupStore {
  /** All groups the user belongs to, newest first. */
  readonly groups: readonly GroupSummary[];

  /** Add a new group at the head of the list. */
  addGroup: (group: GroupSummary) => void;

  /** Insert or replace a group by id (used by sync / refresh flows). */
  upsertGroup: (group: GroupSummary) => void;

  /** Mark a group as archived (hidden from the active list). */
  archiveGroup: (id: string) => void;

  /** Restore an archived group to the active list. */
  unarchiveGroup: (id: string) => void;

  /** Remove a group entirely (used by "Leave group"). */
  leaveGroup: (id: string) => void;

  /** Rename a group. */
  renameGroup: (id: string, name: string, now?: string) => void;

  /** Update the sync-state marker shown on the list card. */
  setSyncState: (id: string, syncState: GroupSyncState) => void;

  /** Read a single group by id, or undefined when not present. */
  getGroup: (id: string) => GroupSummary | undefined;

  /** Clear all groups — used by re-onboarding / qa flows. */
  reset: () => void;
}

export const useGroupStore = create<GroupStore>()(
  persist(
    (set, get) => ({
      groups: [],

      addGroup: (group) =>
        set((state) => ({ groups: [group, ...state.groups] })),

      upsertGroup: (group) =>
        set((state) => {
          const idx = state.groups.findIndex((g) => g.id === group.id);
          if (idx === -1) {
            return { groups: [group, ...state.groups] };
          }
          const next = [...state.groups];
          next[idx] = group;
          return { groups: next };
        }),

      archiveGroup: (id) =>
        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === id ? { ...g, archived: true } : g,
          ),
        })),

      unarchiveGroup: (id) =>
        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === id ? { ...g, archived: false } : g,
          ),
        })),

      leaveGroup: (id) =>
        set((state) => ({
          groups: state.groups.filter((g) => g.id !== id),
        })),

      renameGroup: (id, name, now) =>
        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === id
              ? { ...g, name: name.trim(), updatedAt: now ?? new Date().toISOString() }
              : g,
          ),
        })),

      setSyncState: (id, syncState) =>
        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === id ? { ...g, syncState } : g,
          ),
        })),

      getGroup: (id) => get().groups.find((g) => g.id === id),

      reset: () => set({ groups: [] }),
    }),
    {
      name: GROUP_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
