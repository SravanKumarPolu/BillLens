/**
 * /settings/delete-account — in-app account deletion route.
 *
 * Phase 8 Prompt 77: Apple/Play require an in-app deletion flow that is
 * discoverable and functional. Reached from Settings → Account →
 * "Delete account". Delegates to {@link DeleteAccountScreen}.
 *
 * Deep link: billlens://settings/delete-account
 *
 * v2.4.0: the deletion executor is now WIRED — the screen runs the real
 * `RequestAccountDeletionUseCase` (guest = immediate local wipe via
 * ExpoLocalDataWiper; signed-in = 14-day recovery window + session
 * revocation) and the sync coordinator is stopped before the wipe so
 * nothing uploads mid-deletion.
 */

import { DeleteAccountScreen } from '@presentation/screens/settings/DeleteAccountScreen';
import type { DeleteAccountExecutor } from '@presentation/screens/settings/DeleteAccountScreen';
import {
  resetAppServices,
  stopSyncCoordinator,
  tryGetAppServices,
} from '@store/services-registry';

export default function DeleteAccountRoute(): JSX.Element {
  const onConfirmDelete: DeleteAccountExecutor = async () => {
    const services = tryGetAppServices();
    if (services === null || services.identity === null) {
      throw new Error('Services are still initialising — please try again in a moment.');
    }
    // Stop the offline-sync loop FIRST: the wiper drops the queue table,
    // and an in-flight upload during a wipe could resurrect data.
    await stopSyncCoordinator();
    try {
      const result = await services.identity.accountDeletion.requestDeletion.execute({
        confirmed: true,
      });
      // Map the use-case result onto the screen's outcome vocabulary.
      if (result.outcome === 'scheduled') {
        return {
          kind: 'scheduled',
          recoveryDeadlineAt: result.request.recoveryDeadlineAt as string,
        };
      }
      return { kind: 'guest_wipe_completed' };
    } finally {
      // Drop the cached services graph so the next launch rebuilds from
      // the (wiped or still-present) database cleanly.
      resetAppServices();
    }
  };

  return <DeleteAccountScreen onConfirmDelete={onConfirmDelete} />;
}
