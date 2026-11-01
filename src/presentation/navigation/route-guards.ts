/**
 * Route guards.
 *
 * Route checks that decide whether a route is accessible given the
 * current app state. Synchronous guards validate already-available
 * values; the onboarding hook waits for persisted state hydration.
 *
 * Phase 2 status:
 *   - `requireOnboardingComplete` reads the persisted navigation store.
 *   - `requireGroupExists` and `requireDraftExists` are stubs that
 *     validate the identifier shape only. Once the group / draft stores
 *     land (later prompts), they will consult those stores for actual
 *     existence.
 *
 * Expo Router redirects are render-time primitives, so routes should
 * render a loading state when their decision depends on async hydration.
 */

import { useEffect, useState } from 'react';

import { useNavigationStore } from '@store/navigation-store';

/**
 * Returns true if the user has completed onboarding and may enter the
 * main app. Reads the persisted `onboardingComplete` flag from the
 * navigation store.
 */
export function requireOnboardingComplete(): boolean {
  return useNavigationStore.getState().onboardingComplete;
}

/**
 * Returns the persisted onboarding decision once navigation state has
 * hydrated. While hydration is pending, returns null so the root route
 * can render a loading state instead of redirecting on the default value.
 */
export function useRequireOnboardingComplete(): boolean | null {
  const onboardingComplete = useNavigationStore((state) => state.onboardingComplete);
  const [hasHydrated, setHasHydrated] = useState(() =>
    useNavigationStore.persist.hasHydrated(),
  );

  useEffect(() => {
    const unsubscribe = useNavigationStore.persist.onFinishHydration(() => {
      setHasHydrated(true);
    });

    if (useNavigationStore.persist.hasHydrated()) {
      setHasHydrated(true);
    }

    return unsubscribe;
  }, []);

  return hasHydrated ? onboardingComplete : null;
}

/**
 * Returns true if a group with the given id is accessible to the user.
 *
 * Phase 2 stub: validates the identifier is a non-empty string. The
 * real check (consulting the group store / repository) will be wired up
 * when the group list screen lands.
 */
export function requireGroupExists(groupId: string | undefined | null): boolean {
  if (!groupId) return false;
  if (typeof groupId !== 'string') return false;
  if (groupId.trim().length === 0) return false;
  return true;
}

/**
 * Returns true if a draft with the given id exists and is reviewable.
 *
 * Phase 2 stub: validates the identifier is a non-empty string. The
 * real check (consulting the draft store / repository) will be wired up
 * when the capture pipeline lands.
 */
export function requireDraftExists(draftId: string | undefined | null): boolean {
  if (!draftId) return false;
  if (typeof draftId !== 'string') return false;
  if (draftId.trim().length === 0) return false;
  return true;
}
