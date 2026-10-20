/**
 * Guest identity store.
 *
 * Holds the display name collected during the onboarding flow. The store
 * is the temporary home for this value until a real guest identity is
 * materialised (a later prompt writes the `GuestIdentity` entity to
 * SQLite via the application use case). Until then, the onboarding flow
 * and the home dashboard read the display name from here.
 *
 * Persisted to AsyncStorage — this is UI-state (the chosen display name),
 * not durable financial data. Durable data lives in SQLite (see
 * `src/store/index.ts`).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

const GUEST_STORAGE_KEY = 'billlens.guest-state';

export interface GuestStore {
  /** Display name chosen during onboarding. Empty until the user enters one. */
  readonly displayName: string;
  /** Save the display name (already validated upstream). */
  setDisplayName: (value: string) => void;
  /** Clear the guest state — used by re-onboarding / qa flows. */
  reset: () => void;
}

export const useGuestStore = create<GuestStore>()(
  persist(
    (set) => ({
      displayName: '',
      setDisplayName: (value) => set({ displayName: value }),
      reset: () => set({ displayName: '' }),
    }),
    {
      name: GUEST_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
