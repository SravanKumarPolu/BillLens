/**
 * Outstanding-balance reminders — on-device only.
 *
 * No push service and no server: the app computes whether any group still
 * has a suggested transfer and asks the notification service to schedule
 * one local reminder per day. Opening the app refreshes both the decision
 * and the copy, so a settled-up book cancels the reminder instead of
 * nagging.
 *
 * This module is the presentation-facing seam. It contains no Expo import:
 * the native work lives behind `services.notifications.outstandingReminder`
 * (see `src/application/notifications/` and
 * `src/infrastructure/notifications/`), which is what keeps the app
 * working in Expo Go, on web, and with notifications denied.
 */

import type { OutstandingReminderStatus } from '@application/notifications/notification-capability.port';
import { OUTSTANDING_REMINDER_ID } from '@application/notifications/refresh-outstanding-reminder.usecase';
import type { AppServices } from '@infrastructure/composition-root';
import { useGroupStore } from '@store/group-store';
import { useNotificationStore } from '@store/notification-store';
import { tryGetAppServices } from '@store/services-registry';

export { OUTSTANDING_REMINDER_ID };

/**
 * Status surfaced to the settings screen. `unsupported` means the decision
 * was stored but this runtime cannot present it (Expo Go, web); `denied`
 * means the user refused the OS permission.
 */
export type ReminderStatus = OutstandingReminderStatus;

/**
 * Serialise refreshes. Several entry points can fire at once (app start,
 * resume, the settings toggle, settlement confirmation); running them
 * concurrently would read the OS schedule twice and could schedule the
 * same reminder twice.
 */
let queue: Promise<unknown> = Promise.resolve();

function serialise<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function refreshOutstandingReminder(
  services: AppServices,
  groupIds: readonly string[],
  enabled: boolean,
): Promise<ReminderStatus> {
  return serialise(async () => {
    let groupsWithBalance = 0;
    for (const groupId of groupIds) {
      try {
        const suggestions = await services.explanations.generateSettlementSuggestions.execute({
          groupId: groupId as never,
        });
        if (suggestions.suggestions.some((entry) => entry.transfers.length > 0)) {
          groupsWithBalance += 1;
        }
      } catch {
        // A group that cannot be read must not block reminders for others.
      }
    }

    return services.notifications.outstandingReminder.execute({ enabled, groupsWithBalance });
  });
}

/**
 * Recompute the reminder from current app state.
 *
 * Used when something outside the settings screen can invalidate the
 * reminder — app resume, or a settlement that completes and clears the
 * last open balance. Returns null when storage is not ready yet.
 */
export async function reconcileOutstandingReminder(): Promise<ReminderStatus | null> {
  const services = tryGetAppServices();
  if (services === null) return null;
  const enabled = useNotificationStore.getState().outstandingReminders;
  const groupIds = useGroupStore.getState().groups.map((group) => group.id);
  return refreshOutstandingReminder(services, groupIds, enabled);
}
