/**
 * Theme preference store.
 *
 * Persists the user's theme preference ('light' | 'dark' | 'system') across
 * app launches using AsyncStorage. This is UI-state, not durable financial
 * data, so Zustand + AsyncStorage is the correct home (see
 * `src/store/index.ts` — long-term durable data lives in SQLite).
 *
 * The store holds only the *preference*; resolving 'system' to a concrete
 * mode is the job of `ThemeProvider` (which needs `useColorScheme`, a React
 * hook, and therefore cannot live in a plain store).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ThemeMode } from '@presentation/design-system/theme';

const THEME_STORAGE_KEY = 'billlens.theme-preference';

export interface ThemeStore {
  /** User's theme preference. Defaults to 'system' (follow OS). */
  readonly mode: ThemeMode;
  /** Replace the preference. Persisted to AsyncStorage. */
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      mode: 'system',
      setMode: (mode) => set({ mode }),
    }),
    {
      name: THEME_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
