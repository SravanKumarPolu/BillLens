import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { queryClient } from './query-client';

/**
 * Application-layer React provider that wraps the app in a TanStack
 * QueryClient context.
 *
 * This is the ONE file in the application layer that imports React —
 * the QueryClient itself (in `query-client.ts`) is framework-agnostic
 * and can be used outside of React (e.g. by the sync engine to
 * invalidate caches after a sync).
 *
 * The architecture-independence test (`application-independence.test.ts`)
 * is relaxed for files under `src/application/providers/**` to permit
 * `@tanstack/react-query` and `react` imports here and ONLY here. All
 * other application-layer files remain forbidden from importing either
 * module — the boundary is intentionally narrow.
 *
 * Mount this provider once at the root of the app (see `app/_layout.tsx`),
 * INSIDE the ThemeProvider so screens can read both the theme and the
 * query cache via their respective hooks.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
