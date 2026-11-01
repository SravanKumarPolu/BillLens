/**
 * use-group-store-hydration — makes the persisted group store a
 * read-through cache of SQLite.
 *
 * WHY THIS EXISTS
 *
 * The Groups tab and the Home dashboard's recent-groups cards read
 * `useGroupStore` (a small zustand cache persisted to AsyncStorage).
 * That cache was written ONLY by the create/edit/expense/settlement
 * screens, with values that were never recomputed:
 *
 *   - `userBalanceMinor` was copied from the previous cache entry
 *     (`existingGroup?.userBalanceMinor ?? 0`) — so every new group
 *     showed 0.00 forever, even after the user paid or was paid;
 *   - `syncState` was written as `'pending'` at creation and
 *     `setSyncState` had no callers — every group showed "Syncing"
 *     forever;
 *   - `lastActivityLabel` was frozen at "Just now";
 *   - any group that reached SQLite by another path (backup restore,
 *     remote download, a future join flow) never appeared at all, so
 *     restoring a backup showed an empty app while the financial rows
 *     sat in the local database.
 *
 * SQLite is the primary store (AGENTS.md). This hook loads the domain
 * `GroupSummaryQuery` read model — real balances (same completed-
 * settlement contract as the balance engine), real member/expense
 * counts, real last-activity timestamps, real sync-queue counters —
 * and `replaceAllGroups`-es it into the cache. Screens keep reading
 * the store (no rewrite of every consumer); the cache is now truthful.
 *
 * WHEN IT RUNS
 *
 *   - once the services registry becomes ready (boot);
 *   - whenever the tabs navigator regains focus (returning from a
 *     modal / pushed screen);
 *   - immediately after a backup restore (`hydrateGroupStore()`);
 *   - fire-and-forget after creating a group (the optimistic cache
 *     entry is replaced by the SQLite truth).
 *
 * Layering: presentation hook → services registry + store. It must not
 * import infrastructure directly.
 */

import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import type { GroupSummary as GroupSummaryReadModel } from '@domain/repositories/queries';
import { deriveGroupSyncState } from '@presentation/view-models/groups';
import { formatRelativeTime } from '@presentation/utils/relative-time';
import { useGroupStore, type GroupSummary } from '@store/group-store';
import {
  isCloudSyncConfigured,
  tryGetAppServices,
  useAppServicesReady,
} from '@store/services-registry';

/**
 * Pre-identity owner id — the same synthetic id `CreateGroupUseCase`
 * writes onto the owner member (KNOWN_LIMITATIONS KL-13). Exported so
 * callers do not re-hardcode the string.
 */
export const PRE_IDENTITY_USER_ID = 'local-user';

/** Result of one hydration pass. */
export interface GroupStoreHydrationState {
  /** True until the first completed pass (success or failure). */
  readonly loading: boolean;
  /** True once at least one pass finished (even if it failed). */
  readonly loadedOnce: boolean;
  /** Readable error when the SQLite read model failed. */
  readonly error: string | null;
  /** Number of groups the last successful pass wrote into the cache. */
  readonly lastCount: number;
}

const INITIAL: GroupStoreHydrationState = {
  loading: true,
  loadedOnce: false,
  error: null,
  lastCount: 0,
};

/** In-flight dedupe: concurrent callers share one SQLite round trip. */
let inFlight: Promise<GroupStoreHydrationState> | null = null;

/**
 * Load group summaries from SQLite and replace the cache.
 *
 * Safe to call before services are ready (returns a not-loaded state
 * without touching the cache) and concurrently (one round trip). The
 * persisted cache keeps UI-only fields (`groupType`, `privacyDefault`)
 * for known groups via `replaceAllGroups`.
 */
export async function hydrateGroupStore(
  userId: string = PRE_IDENTITY_USER_ID,
): Promise<GroupStoreHydrationState> {
  const services = tryGetAppServices();
  if (services === null) {
    // Gate still initializing — keep the previous cache; the readiness
    // subscription re-triggers the hook once the graph exists.
    return INITIAL;
  }
  if (inFlight !== null) return inFlight;

  inFlight = (async (): Promise<GroupStoreHydrationState> => {
    try {
      const summaries = await services.queries.groupSummaries.listForUser(userId as never);
      const cloudConfigured = isCloudSyncConfigured();
      const mapped: GroupSummary[] = summaries.map((s) =>
        toCachedGroupSummary(s, cloudConfigured),
      );
      useGroupStore.getState().replaceAllGroups(mapped);
      return {
        loading: false,
        loadedOnce: true,
        error: null,
        lastCount: mapped.length,
      };
    } catch (error) {
      return {
        loading: false,
        loadedOnce: true,
        error:
          error instanceof Error
            ? error.message
            : 'Could not load your groups from local storage.',
        lastCount: 0,
      };
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Mount-once hook for the tabs layout (and any screen that wants to
 * drive hydration itself). Re-runs when services become ready and when
 * the screen regains focus. Returns the current hydration state so the
 * Groups list can show a skeleton until the first pass completes.
 */
export function useGroupStoreHydration(): GroupStoreHydrationState & {
  readonly retry: () => void;
} {
  const servicesReady = useAppServicesReady();
  const [state, setState] = useState<GroupStoreHydrationState>(INITIAL);

  const run = useCallback((): void => {
    void hydrateGroupStore().then((next) => {
      setState(next);
    });
  }, []);

  useEffect(() => {
    if (servicesReady) run();
  }, [servicesReady, run]);

  useFocusEffect(
    useCallback(() => {
      if (servicesReady) run();
    }, [servicesReady, run]),
  );

  return { ...state, retry: run };
}

/** Map a domain read-model row to the persisted UI cache row. */
export function toCachedGroupSummary(
  summary: GroupSummaryReadModel,
  cloudConfigured: boolean,
): GroupSummary {
  return {
    id: summary.id as string,
    name: summary.name,
    currencyCode: summary.currencyCode as string,
    // The card means "people currently in the group".
    memberCount: summary.activeMemberCount,
    userBalanceMinor: summary.userBalanceMinor,
    lastActivityLabel: formatRelativeTime(summary.lastActivityAt as string),
    archived: summary.archived,
    syncState: deriveGroupSyncState({
      pendingSyncOps: summary.pendingSyncOps,
      failedSyncOps: summary.failedSyncOps,
      cloudConfigured,
    }),
    // Replaced for known groups by replaceAllGroups (KL-12).
    groupType: 'General',
    privacyDefault: 'local_only',
    createdAt: summary.createdAt as string,
    updatedAt: summary.updatedAt as string,
  };
}
