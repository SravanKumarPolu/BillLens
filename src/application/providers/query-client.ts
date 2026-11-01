import { QueryClient } from '@tanstack/react-query';

/**
 * Application-layer QueryClient singleton.
 *
 * BillLens uses TanStack Query for fetching data from repositories (groups,
 * expenses, balances, drafts). Zustand continues to handle ephemeral UI
 * state (current draft, navigation state, theme, capture-pipeline status).
 *
 * This file lives in the application layer because:
 *   - The QueryClient is a non-React, framework-agnostic cache. It does
 *     not import React.
 *   - The query-key factory (`queryKeys`) encodes the application's data
 *     shape — it belongs with the application layer that owns those
 *     entity boundaries.
 *
 * The companion `query-provider.tsx` lives in the same folder but is the
 * ONLY file in the application layer that imports React (it wraps the
 * QueryClient in a React context provider). The architecture-independence
 * test is relaxed for the `application/providers/**` path to permit
 * `@tanstack/react-query` and `react` imports there and ONLY there.
 *
 * The composition root (`src/infrastructure/composition-root.ts`, added
 * in a later Phase 3 prompt) wires concrete repositories into the query
 * functions; the QueryClient itself is independent of any repository.
 */

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 1 minute — fresh data is reused without refetching for up to a
      // minute. After that, TanStack Query will refetch in the background
      // when the data is next read.
      staleTime: 1000 * 60,
      // 5 minutes — entries stay in the cache for 5 minutes after the
      // last component unsubscribes, so a quick navigation back-and-forth
      // doesn't trigger a refetch.
      gcTime: 1000 * 60 * 5,
      // Retry once on transient failure. The user sees the error state
      // after a single retry rather than a long retry storm.
      retry: 1,
      // Do NOT refetch when the user returns to the app — offline-first
      // means we trust the local cache and let the sync engine push
      // changes when the device is online.
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Mutations are NOT retried automatically. The sync queue handles
      // retries for offline mutations; retrying inline would risk
      // duplicate writes.
      retry: 0,
    },
  },
});

/**
 * Type-safe query-key factory.
 *
 * Centralising keys here prevents typos and ensures the cache is
 * invalidated consistently when underlying data changes (e.g. creating
 * a new expense invalidates the `expenses.byGroup` list).
 *
 * Each key is a tuple of strings — TanStack Query uses these as
 * hierarchical cache keys (so `['expenses', 'group', 'g1']` is a
 * "child" of `['expenses']` and can be invalidated together).
 */
export const queryKeys = {
  groups: {
    all: ['groups'] as const,
    lists: () => [...queryKeys.groups.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.groups.all, 'detail', id] as const,
  },
  expenses: {
    all: ['expenses'] as const,
    byGroup: (groupId: string) =>
      [...queryKeys.expenses.all, 'group', groupId] as const,
    detail: (id: string) => [...queryKeys.expenses.all, 'detail', id] as const,
  },
  balances: {
    byGroup: (groupId: string) => ['balances', 'group', groupId] as const,
  },
  drafts: {
    all: ['drafts'] as const,
    detail: (id: string) => [...queryKeys.drafts.all, 'detail', id] as const,
  },
} as const;
