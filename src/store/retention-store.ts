/**
 * Retention preference store.
 *
 * Persists the user's chosen retention period (days of inactivity before
 * a local group becomes *eligible* for cleanup). This is a preference,
 * not financial data, so AsyncStorage is the right home.
 *
 * The default is one year. Nothing is deleted automatically at any
 * period — the value only changes when a group is offered in the Data &
 * storage screen.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_RETENTION_DAYS } from '@domain/retention/retention-policy';

const RETENTION_STORAGE_KEY = 'billlens.retention-preference';

/** Offered choices, in days. */
export const RETENTION_OPTIONS: readonly { readonly days: number; readonly label: string }[] = [
  { days: 180, label: '6 months' },
  { days: 365, label: '1 year' },
  { days: 730, label: '2 years' },
] as const;

export interface RetentionStore {
  readonly retentionDays: number;
  setRetentionDays: (days: number) => void;
  reset: () => void;
}

export const useRetentionStore = create<RetentionStore>()(
  persist(
    (set) => ({
      retentionDays: DEFAULT_RETENTION_DAYS,
      setRetentionDays: (days) =>
        set({ retentionDays: Math.max(1, Math.floor(days)) }),
      reset: () => set({ retentionDays: DEFAULT_RETENTION_DAYS }),
    }),
    {
      name: RETENTION_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
