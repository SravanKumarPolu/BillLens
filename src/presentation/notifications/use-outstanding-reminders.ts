/**
 * Keep the local outstanding-balance reminder reconciled.
 *
 * Runs when the services graph becomes ready, whenever the preference
 * changes, and again every time the app returns to the foreground. The
 * resume pass is what recovers from an OS that dropped the schedule
 * (reboot, Doze, a permission change in system settings) and what
 * cancels a reminder whose balance was settled in another app session.
 *
 * Failures are impossible by construction: `reconcileOutstandingReminder`
 * returns a status and never throws.
 */

import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useNotificationStore } from '@store/notification-store';
import { useAppServicesReady } from '@store/services-registry';

import { reconcileOutstandingReminder } from './outstanding-reminders';

export function useOutstandingReminders(): void {
  const ready = useAppServicesReady();
  // The preference is part of the dependency list so toggling it
  // re-evaluates immediately, even before the settings screen's own call.
  const enabled = useNotificationStore((state) => state.outstandingReminders);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    const run = async (): Promise<void> => {
      if (cancelled) return;
      await reconcileOutstandingReminder();
    };

    void run();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void run();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [ready, enabled]);
}
