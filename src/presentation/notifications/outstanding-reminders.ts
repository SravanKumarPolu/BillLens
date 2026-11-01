/**
 * Outstanding-balance reminders — on-device only.
 *
 * No push service and no server: the app computes whether any group still has
 * a suggested transfer and schedules one local reminder per day. Opening the
 * app refreshes both the decision and the copy, so a settled-up book cancels
 * the reminder instead of nagging.
 */

import { Platform } from 'react-native';

import type { AppServices } from '@infrastructure/composition-root';

export const OUTSTANDING_REMINDER_ID = 'billlens.outstanding-balances';

export type ReminderStatus =
  | 'scheduled'
  | 'none'
  | 'denied'
  | 'unsupported'
  | 'disabled'
  | 'error';

export async function refreshOutstandingReminder(
  services: AppServices,
  groupIds: readonly string[],
  enabled: boolean,
): Promise<ReminderStatus> {
  if (Platform.OS === 'web') return 'unsupported';

  try {
    const Notifications = await import('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });

    await Notifications.cancelScheduledNotificationAsync(OUTSTANDING_REMINDER_ID).catch(
      () => undefined,
    );
    if (!enabled) return 'disabled';

    const current = await Notifications.getPermissionsAsync();
    const granted =
      current.granted ||
      (current.canAskAgain ? (await Notifications.requestPermissionsAsync()).granted : false);
    if (!granted) return 'denied';

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
    if (groupsWithBalance === 0) return 'none';

    await Notifications.scheduleNotificationAsync({
      identifier: OUTSTANDING_REMINDER_ID,
      content: {
        title: 'Settle up in BillLens',
        body:
          groupsWithBalance === 1
            ? 'One group still has an outstanding balance.'
            : `${groupsWithBalance} groups still have outstanding balances.`,
        data: { route: '/(tabs)/activity' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 24 * 60 * 60,
        repeats: true,
      },
    });
    return 'scheduled';
  } catch (error) {
    console.warn(
      '[Reminders] scheduling failed:',
      error instanceof Error ? error.message : 'unknown',
    );
    return 'error';
  }
}
