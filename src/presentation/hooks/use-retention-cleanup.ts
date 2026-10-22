/** Daily, bounded temp-file retention cleanup (never financial rows). */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';

import { useRetentionStore } from '@store/retention-store';
import { tryGetAppServices, useAppServicesReady } from '@store/services-registry';

const LAST_RUN_KEY = 'billlens.retention-last-run';

export function useRetentionCleanup(): void {
  const ready = useAppServicesReady();
  const mode = useRetentionStore((state) => state.mode);
  const retentionDays = useRetentionStore((state) => state.retentionDays);

  useEffect(() => {
    if (!ready || mode !== 'auto_temp') return;
    let cancelled = false;
    void (async () => {
      const last = await AsyncStorage.getItem(LAST_RUN_KEY).catch(() => null);
      if (last !== null && Date.now() - Number(last) < 86_400_000) return;
      const services = tryGetAppServices();
      if (services === null || cancelled) return;
      await services.data.retentionCleanup
        .execute({ retentionDays, limit: 50 })
        .catch(() => undefined);
      await services.groups.cleanup.execute().catch(() => undefined);
      await AsyncStorage.setItem(LAST_RUN_KEY, String(Date.now())).catch(() => undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, mode, retentionDays]);
}
