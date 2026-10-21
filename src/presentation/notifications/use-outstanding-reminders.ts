/** Refresh the local outstanding reminder whenever services and prefs are ready. */

import { useEffect } from 'react';

import { useNotificationStore } from '@store/notification-store';
import { useGroupStore } from '@store/group-store';
import { tryGetAppServices, useAppServicesReady } from '@store/services-registry';

import { refreshOutstandingReminder } from './outstanding-reminders';

export function useOutstandingReminders(): void {
  const ready = useAppServicesReady();
  const enabled = useNotificationStore((state) => state.outstandingReminders);

  useEffect(() => {
    if (!ready || !enabled) return;
    let cancelled = false;
    void (async () => {
      const services = tryGetAppServices();
      if (services === null) return;
      const groupIds = useGroupStore.getState().groups.map((group) => group.id);
      if (cancelled) return;
      await refreshOutstandingReminder(services, groupIds, enabled);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, enabled]);
}
