/**
 * Route guards.
 *
 * Pure synchronous functions that decide whether a route is accessible
 * given the current app state. Route files call these before rendering
 * sensitive content; if a guard returns false, the route file renders a
 * `<Redirect />` to a safer destination.
 *
 * Phase 2 status:
 *   - `requireOnboardingComplete` reads the persisted navigation store.
 *   - `requireGroupExists` and `requireDraftExists` are stubs that
 *     validate the identifier shape only. Once the group / draft stores
 *     land (later prompts), they will consult those stores for actual
 *     existence.
 *
 * These functions are kept synchronous on purpose — expo-router's
 * `<Redirect />` is a synchronous render-time primitive, and guards
 * must not block on async I/O. State that requires async hydration is
 * expected to already be loaded by the time a screen renders.
 */

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
