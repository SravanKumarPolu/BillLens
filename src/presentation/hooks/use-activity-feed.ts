/**
 * use-activity-feed — loads the unified recent-activity timeline across
 * all of the user's persisted groups via the services registry.
 *
 * Architecture:
 *   - Reads the list of group ids from `useGroupStore` (the persisted
 *     UI store — the same source the Groups List tab reads).
 *   - Calls `services.activity.listRecentActivity.execute({ groupIds })`
 *     to get the merged timeline.
 *   - Re-loads on services-ready and on screen focus.
 *   - Returns an honest "not ready" state while the gate initializes.
 */

import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import type { ActivityEntry } from '@application/activity/list-recent-activity.usecase';
import { useGroupStore } from '@store/group-store';
import { useAppServicesReady, tryGetAppServices } from '@store/services-registry';

export interface UseActivityFeedResult {
  readonly loading: boolean;
  readonly loadedOnce: boolean;
  readonly error: string | null;
  readonly entries: readonly ActivityEntry[];
  /** True when the timeline has more entries available beyond the page. */
  readonly hasMore: boolean;
}

const INITIAL: UseActivityFeedResult = {
  loading: true,
  loadedOnce: false,
  error: null,
  entries: [],
  hasMore: false,
};

/** Default page size (matches the use case's default; capped at 50). */
const DEFAULT_LIMIT = 20;

export function useActivityFeed(limit: number = DEFAULT_LIMIT): UseActivityFeedResult {
  const servicesReady = useAppServicesReady();
  const groups = useGroupStore((s) => s.groups);
  const [state, setState] = useState<UseActivityFeedResult>(INITIAL);

  const load = useCallback(async (): Promise<void> => {
    const services = tryGetAppServices();
    if (services === null) {
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const groupIds = groups
        .filter((g) => !g.archived)
        .map((g) => g.id as never);
      const result = await services.activity.listRecentActivity.execute({
        groupIds,
        limit,
      });
      setState({
        loading: false,
        loadedOnce: true,
        error: null,
        entries: result.entries,
        hasMore: result.hasMore,
      });
    } catch (err) {
      setState({
        loading: false,
        loadedOnce: true,
        error: err instanceof Error ? err.message : 'Could not load recent activity.',
        entries: [],
        hasMore: false,
      });
    }
  }, [groups, limit]);

  useEffect(() => {
    void load();
  }, [load, servicesReady]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return state;
}
