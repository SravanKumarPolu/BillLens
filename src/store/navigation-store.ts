/**
 * Navigation store.
 *
 * Holds ephemeral UI-state that drives navigation decisions:
 *   - `onboardingComplete` — gates access to the main app. The root
 *     `app/index.tsx` reads this on launch to decide between
 *     `/onboarding/welcome` and `/(tabs)/`. Persisted so the user
 *     doesn't re-onboard on every app launch.
 *   - `hasUnsavedDraftChanges` — set true while the user is mid-edit on
 *     a draft expense. The route guard for `expenses/new` and
 *     `drafts/[id]` reads this to warn before navigating away.
 *
 * Persisted to AsyncStorage — this is UI-state, not durable financial
 * data. Durable data lives in SQLite (see `src/store/index.ts`).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

const NAVIGATION_STORAGE_KEY = 'billlens.navigation-state';

export interface NavigationStore {
  /** Whether the user has completed the onboarding flow. */
  readonly onboardingComplete: boolean;
  /** Mark onboarding as complete (or incomplete, for re-onboarding/qa). */
  setOnboardingComplete: (value: boolean) => void;

  /**
   * True while the user has unsaved edits on a draft expense. Route
   * guards read this to warn before navigating away.
   */
  readonly hasUnsavedDraftChanges: boolean;
  setHasUnsavedDraftChanges: (value: boolean) => void;
}

export const useNavigationStore = create<NavigationStore>()(
  persist(
    (set) => ({
      onboardingComplete: false,
      setOnboardingComplete: (value) => set({ onboardingComplete: value }),

      hasUnsavedDraftChanges: false,
      setHasUnsavedDraftChanges: (value) => set({ hasUnsavedDraftChanges: value }),
    }),
    {
      name: NAVIGATION_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
