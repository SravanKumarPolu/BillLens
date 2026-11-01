/** Run the durable receipt-file cleanup outbox once when services are ready. */

import { useEffect } from 'react';

import { tryGetAppServices, useAppServicesReady } from '@store/services-registry';

export function useFileCleanup(): void {
  const ready = useAppServicesReady();
  useEffect(() => {
    if (!ready) return;
    const services = tryGetAppServices();
    if (services === null) return;
    void services.groups.cleanup.execute().catch(() => undefined);
  }, [ready]);
}
