/**
 * Settlement detail tests (v2.26.2).
 *
 * Covers the new `/settlements/[settlementId]` screen:
 *   - loading and not-found states,
 *   - completed settlements expose a guarded reversal,
 *   - pending settlements do not,
 *   - reversals explain themselves,
 *   - the container reverses with the persisted version and reloads.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';

import {
  SettlementDetailScreen,
  SettlementDetailView,
  type SettlementDetailViewModel,
} from '@presentation/screens/settlement/SettlementDetailScreen';
import { tryGetAppServices } from '@store/services-registry';

jest.mock('@store/services-registry', () => ({
  __esModule: true,
  tryGetAppServices: jest.fn(),
}));

const COMPLETED: SettlementDetailViewModel = {
  id: 'st-1',
  groupId: 'g-1',
  fromMemberId: 'm-1',
  toMemberId: 'm-2',
  status: 'completed',
  amountMinor: 12_500,
  currencyCode: 'USD',
  fromName: 'Alice',
  toName: 'Bob',
  settlementDate: '2026-10-01',
  method: 'bank_transfer',
  note: 'October rent share',
  isReversal: false,
  canReverse: true,
};

async function flushUntil(predicate: () => boolean, timeoutMs = 4_000): Promise<void> {
  const startedAt = Date.now();
  for (;;) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    if (predicate()) return;
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for the expected screen state');
    }
  }
}

describe('SettlementDetailView', () => {
  it('renders the settlement facts and the guarded reversal', () => {
    const onReverse = jest.fn();
    const { getByText, getByLabelText, toJSON } = render(
      <SettlementDetailView
        view={COMPLETED}
        loading={false}
        error={null}
        onReverse={onReverse}
      />,
    );

    expect(getByText('Alice paid Bob')).toBeTruthy();
    expect(getByText('Completed')).toBeTruthy();
    expect(getByText('Bank transfer')).toBeTruthy();
    expect(getByText('October rent share')).toBeTruthy();
    expect(getByText(/separate\s+compensating entry/)).toBeTruthy();

    // AUDIT_OCT_2026 §3.1: the spoken amount is formatted ("$125.00 USD"),
    // and the raw minor-unit integer (12500) never reaches the UI.
    expect(getByLabelText('$125.00 USD')).toBeTruthy();
    expect(JSON.stringify(toJSON())).not.toContain('12500');

    fireEvent.press(getByLabelText('Reverse this settlement'));
    expect(onReverse).toHaveBeenCalledTimes(1);
  });

  it('hides reversal for settlements that are not completed', () => {
    const { queryByLabelText, getByText } = render(
      <SettlementDetailView
        view={{ ...COMPLETED, status: 'pending_confirmation', canReverse: false }}
        loading={false}
        error={null}
        onReverse={() => undefined}
      />,
    );

    expect(getByText('Awaiting confirmation')).toBeTruthy();
    expect(queryByLabelText('Reverse this settlement')).toBeNull();
  });

  it('explains a reversal record without offering another reversal', () => {
    const { getByText, queryByLabelText } = render(
      <SettlementDetailView
        view={{
          ...COMPLETED,
          status: 'reversed',
          isReversal: true,
          canReverse: false,
        }}
        loading={false}
        error={null}
      />,
    );

    expect(getByText('Reversed')).toBeTruthy();
    expect(getByText(/cancels an earlier settlement/)).toBeTruthy();
    expect(queryByLabelText('Reverse this settlement')).toBeNull();
  });

  it('renders the loading and not-found states', () => {
    const loading = render(
      <SettlementDetailView view={null} loading error={null} />,
    );
    expect(loading.getByText('Loading this settlement…')).toBeTruthy();
    loading.unmount();

    const missing = render(
      <SettlementDetailView
        view={null}
        loading={false}
        error="Settlement not found."
      />,
    );
    expect(missing.getByText('Could not load settlement')).toBeTruthy();
    expect(missing.getByText('Settlement not found.')).toBeTruthy();
  });

  it('surfaces an action error', () => {
    const { getByText } = render(
      <SettlementDetailView
        view={COMPLETED}
        loading={false}
        error={null}
        actionError="Could not reverse this settlement."
      />,
    );
    expect(getByText('Could not reverse this settlement.')).toBeTruthy();
  });

  it('shows the remind card only for pending settlements', () => {
    const completed = render(
      <SettlementDetailView view={COMPLETED} loading={false} error={null} />,
    );
    expect(completed.queryByLabelText('Remind me to confirm this settlement tomorrow')).toBeNull();
    completed.unmount();

    const pending = render(
      <SettlementDetailView
        view={{ ...COMPLETED, status: 'pending_confirmation', canReverse: false }}
        loading={false}
        error={null}
        onRemind={() => undefined}
      />,
    );
    expect(pending.getByText('Remind to confirm')).toBeTruthy();
    expect(pending.getByLabelText('Remind me to confirm this settlement tomorrow')).toBeTruthy();
  });

  it('lists a scheduled reminder and cancels it', () => {
    const onCancel = jest.fn();
    const { getByText, getByLabelText } = render(
      <SettlementDetailView
        view={{ ...COMPLETED, status: 'pending_confirmation', canReverse: false }}
        loading={false}
        error={null}
        reminders={[
          { id: 'rem-1', whenLabel: 'Tomorrow at 17:00' },
        ]}
        reminderNotice="Reminder set for tomorrow."
        onCancelReminder={onCancel}
      />,
    );

    expect(getByText('Tomorrow at 17:00')).toBeTruthy();
    expect(getByText('Reminder set for tomorrow.')).toBeTruthy();
    fireEvent.press(getByLabelText('Cancel reminder Tomorrow at 17:00'));
    expect(onCancel).toHaveBeenCalledWith('rem-1');
  });
});

describe('SettlementDetailScreen (container)', () => {
  const getSettlement = jest.fn(async (_input: unknown) => ({
    settlement: {
      id: 'st-1',
      groupId: 'g-1',
      fromMemberId: 'm-1',
      toMemberId: 'm-2',
      amountMinor: 12_500,
      currencyCode: 'USD',
      method: 'bank_transfer',
      settlementDate: '2026-10-01',
      note: 'October rent share',
      createdBy: 'local-user',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
      version: 4,
      status: 'completed',
    },
  }));
  const reverseSettlement = jest.fn(async (_input: unknown) => undefined);
  const createSettlementReminder = jest.fn(async (_input: unknown) => ({
    reminder: { id: 'rem-1' },
  }));
  const cancelSettlementReminder = jest.fn(async (_input: unknown) => undefined);
  const listSettlementReminders = jest.fn(async (_input: unknown) => ({
    items: [] as Array<{ id: string; settlementId?: string; status: string; scheduledAt: string }>,
    nextCursor: undefined as string | undefined,
    hasMore: false,
  }));
  const scheduleNotification = jest.fn(
    async (_request: { identifier?: string; title?: string; body?: string }) => 'scheduled',
  );
  const cancelNotification = jest.fn(async () => undefined);
  const localNotifications = {
    availability: () => 'available' as const,
    permission: async () => 'granted' as const,
    requestPermission: async () => 'granted' as const,
    ensureChannel: async () => undefined,
    schedule: scheduleNotification,
    cancel: cancelNotification,
    listScheduled: async () => [],
  };
  const listGroupMembers = jest.fn(async (_groupId: string) => ({
    groupId: 'g-1',
    groupName: 'Flatmates',
    currencyCode: 'USD',
    members: [
      { id: 'm-1', displayName: 'Alice', role: 'owner', isRegisteredUser: false },
      { id: 'm-2', displayName: 'Bob', role: 'member', isRegisteredUser: false },
    ],
  }));

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(tryGetAppServices).mockReturnValue({
      settlements: { getSettlement: { execute: getSettlement }, reverseSettlement: { execute: reverseSettlement } },
      groups: { listGroupMembers: { execute: listGroupMembers } },
      reminders: {
        createSettlementReminder: { execute: createSettlementReminder },
        cancelSettlementReminder: { execute: cancelSettlementReminder },
        listSettlementReminders: { execute: listSettlementReminders },
      },
      notifications: { localNotifications },
    } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads the settlement with member names', async () => {
    const { getByText, queryByText } = render(
      <SettlementDetailScreen settlementId="st-1" />,
    );

    await flushUntil(() => queryByText(/Loading this settlement/) === null);
    expect(getByText('Alice paid Bob')).toBeTruthy();
    expect(getByText('Completed')).toBeTruthy();
  });

  it('reverses with the persisted version after confirmation', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const confirm = buttons?.find((button) => button.style === 'destructive');
      confirm?.onPress?.();
    });

    const { getByLabelText, getByText } = render(
      <SettlementDetailScreen settlementId="st-1" />,
    );

    await flushUntil(() => getByText('Alice paid Bob') !== undefined);
    fireEvent.press(getByLabelText('Reverse this settlement'));

    await flushUntil(() => reverseSettlement.mock.calls.length > 0);
    expect(reverseSettlement).toHaveBeenCalledWith(
      expect.objectContaining({
        settlementId: 'st-1',
        expectedVersion: 4,
        actorMemberId: 'm-1',
      }),
    );
    // Reloaded after the reversal.
    await flushUntil(() => getSettlement.mock.calls.length >= 2);
  });

  it('shows the not-found message when the record is missing', async () => {
    getSettlement.mockResolvedValueOnce({ settlement: null } as never);
    const { getByText, queryByText } = render(
      <SettlementDetailScreen settlementId="missing" />,
    );

    await flushUntil(() => queryByText(/Loading this settlement/) === null);
    expect(getByText('Could not load settlement')).toBeTruthy();
    expect(getByText(/Settlement not found/)).toBeTruthy();
  });

  it('schedules a tomorrow reminder for a pending settlement', async () => {
    getSettlement.mockResolvedValueOnce({
      settlement: {
        id: 'st-1',
        groupId: 'g-1',
        fromMemberId: 'm-1',
        toMemberId: 'm-2',
        amountMinor: 12_500,
        currencyCode: 'USD',
        method: 'bank_transfer',
        settlementDate: '2026-10-01',
        note: 'October rent share',
        createdBy: 'local-user',
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-01T10:00:00.000Z',
        version: 4,
        status: 'pending_confirmation',
      },
    } as never);
    listSettlementReminders
      .mockResolvedValueOnce({ items: [], nextCursor: undefined, hasMore: false })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'rem-1',
            settlementId: 'st-1',
            status: 'scheduled',
            scheduledAt: '2026-11-02T17:00:00.000Z',
          },
        ],
        nextCursor: undefined,
        hasMore: false,
      });

    const { getByLabelText, getByText, queryByText } = render(
      <SettlementDetailScreen settlementId="st-1" />,
    );

    await flushUntil(() => getByLabelText('Remind me to confirm this settlement tomorrow') !== null);
    expect(queryByText('Completed')).toBeNull();
    fireEvent.press(getByLabelText('Remind me to confirm this settlement tomorrow'));

    await flushUntil(() => createSettlementReminder.mock.calls.length > 0);
    expect(createSettlementReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'g-1',
        settlementId: 'st-1',
        payerMemberId: 'm-1',
        receiverMemberId: 'm-2',
        reminderType: 'pending_confirmation',
        privacyMode: 'private',
      }),
    );
    await flushUntil(() => scheduleNotification.mock.calls.length > 0);
    expect(scheduleNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'settlement-reminder-rem-1',
        title: 'Settlement reminder',
      }),
    );
    // The lock-screen body never carries the amount (private mode).
    const firstScheduleCall = scheduleNotification.mock.calls[0]?.[0];
    expect(String(firstScheduleCall?.body ?? '')).not.toContain('12500');
    await flushUntil(() => getByText('Reminder set for tomorrow.') !== null);
  });
});
