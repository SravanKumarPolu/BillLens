/** Local reminder preference. Persisted UI state, not financial data. */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface NotificationStore {
  readonly outstandingReminders: boolean;
  setOutstandingReminders: (enabled: boolean) => void;
}

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set) => ({
      outstandingReminders: false,
      setOutstandingReminders: (enabled) => set({ outstandingReminders: enabled }),
    }),
    {
      name: 'billlens.notification-prefs',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
