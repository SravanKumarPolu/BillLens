/**
 * RefreshOutstandingReminderUseCase — behaviour under every runtime and
 * permission state, including the Expo Go path where the reminder must be
 * stored but cannot be presented.
 */

import { describe, expect, it } from '@jest/globals';

import type {
  LocalNotificationPort,
  LocalNotificationRequest,
  LocalNotificationScheduleResult,
  NotificationAvailability,
  NotificationPermissionState,
  OutstandingReminderRecord,
  OutstandingReminderStore,
  ScheduledLocalNotification,
} from '@application/notifications/notification-capability.port';
import {
  OUTSTANDING_REMINDER_ID,
  RefreshOutstandingReminderUseCase,
} from '@application/notifications/refresh-outstanding-reminder.usecase';

const NOW = new Date('2026-10-23T10:00:00.000Z');

class FakeCapability implements LocalNotificationPort {
  readonly cancelled: string[] = [];
  readonly scheduled: LocalNotificationRequest[] = [];
  readonly calls: string[] = [];
  existing: ScheduledLocalNotification[] = [];

  constructor(
    private readonly options: {
      readonly availability?: NotificationAvailability;
      readonly permission?: NotificationPermissionState;
      readonly requestedPermission?: NotificationPermissionState;
      readonly scheduleResult?: LocalNotificationScheduleResult;
      readonly failPermission?: boolean;
    } = {},
  ) {}

  availability(): NotificationAvailability {
    return this.options.availability ?? 'available';
  }

  async permission(): Promise<NotificationPermissionState> {
    this.calls.push('permission');
    if (this.options.failPermission === true) throw new Error('native module missing');
    return this.options.permission ?? 'granted';
  }

  async requestPermission(): Promise<NotificationPermissionState> {
    this.calls.push('requestPermission');
    return this.options.requestedPermission ?? 'granted';
  }

  async ensureChannel(): Promise<void> {
    this.calls.push('ensureChannel');
  }

  async listScheduled(): Promise<readonly ScheduledLocalNotification[]> {
    this.calls.push('listScheduled');
    return this.existing;
  }

  async schedule(request: LocalNotificationRequest): Promise<LocalNotificationScheduleResult> {
    this.calls.push('schedule');
    this.scheduled.push(request);
    return this.options.scheduleResult ?? 'scheduled';
  }

  async cancel(identifier: string): Promise<void> {
    this.calls.push(`cancel:${identifier}`);
    this.cancelled.push(identifier);
  }

  /** Readable alias used by the assertions below. */
  canceledIds(): readonly string[] {
    return this.cancelled;
  }
}

class FakeStore implements OutstandingReminderStore {
  readonly records = new Map<string, OutstandingReminderRecord>();
  failSave = false;

  async load(id: string): Promise<OutstandingReminderRecord | null> {
    return this.records.get(id) ?? null;
  }

  async save(record: OutstandingReminderRecord): Promise<void> {
    if (this.failSave) throw new Error('disk full');
    this.records.set(record.id, record);
  }

  async clear(id: string): Promise<void> {
    this.records.delete(id);
  }
}

function build(
  capability: FakeCapability,
  store = new FakeStore(),
): { useCase: RefreshOutstandingReminderUseCase; store: FakeStore } {
  return {
    useCase: new RefreshOutstandingReminderUseCase({ capability, store }),
    store,
  };
}

describe('RefreshOutstandingReminderUseCase', () => {
  it('cancels the native reminder when the preference is off', async () => {
    const capability = new FakeCapability();
    const { useCase, store } = build(capability);

    const status = await useCase.execute({ enabled: false, groupsWithBalance: 3, now: NOW });

    expect(status).toBe('disabled');
    expect(capability.cancelled).toContain(OUTSTANDING_REMINDER_ID);
    expect(capability.scheduled).toHaveLength(0);
    expect(store.records.get(OUTSTANDING_REMINDER_ID)).toMatchObject({
      status: 'disabled',
      delivery: 'none',
      groupsWithBalance: 3,
    });
  });

  it('cancels the reminder and reports "none" when every balance is settled', async () => {
    const capability = new FakeCapability();
    const { useCase, store } = build(capability);

    const status = await useCase.execute({ enabled: true, groupsWithBalance: 0, now: NOW });

    expect(status).toBe('none');
    expect(capability.cancelled).toContain(OUTSTANDING_REMINDER_ID);
    expect(capability.scheduled).toHaveLength(0);
    expect(store.records.get(OUTSTANDING_REMINDER_ID)?.status).toBe('none');
  });

  it('stores the reminder without touching the native module in Expo Go', async () => {
    const capability = new FakeCapability({ availability: 'expo-go' });
    const { useCase, store } = build(capability);

    const status = await useCase.execute({ enabled: true, groupsWithBalance: 2, now: NOW });

    expect(status).toBe('unsupported');
    expect(capability.calls).toHaveLength(0);
    expect(store.records.get(OUTSTANDING_REMINDER_ID)).toMatchObject({
      status: 'unsupported',
      delivery: 'stored_only',
      groupsWithBalance: 2,
    });
  });

  it('does the same on a platform with no notification support', async () => {
    const capability = new FakeCapability({ availability: 'unsupported' });
    const { useCase, store } = build(capability);

    await expect(
      useCase.execute({ enabled: true, groupsWithBalance: 1, now: NOW }),
    ).resolves.toBe('unsupported');
    expect(capability.calls).toHaveLength(0);
    expect(store.records.get(OUTSTANDING_REMINDER_ID)?.delivery).toBe('stored_only');
  });

  it('asks for permission only while the OS still allows it', async () => {
    const capability = new FakeCapability({
      permission: 'undetermined',
      requestedPermission: 'denied',
    });
    const { useCase, store } = build(capability);

    const status = await useCase.execute({ enabled: true, groupsWithBalance: 1, now: NOW });

    expect(status).toBe('denied');
    expect(capability.calls).toContain('requestPermission');
    expect(capability.scheduled).toHaveLength(0);
    expect(store.records.get(OUTSTANDING_REMINDER_ID)?.delivery).toBe('none');
  });

  it('schedules one daily reminder when permission is granted', async () => {
    const capability = new FakeCapability();
    const { useCase, store } = build(capability);

    const status = await useCase.execute({ enabled: true, groupsWithBalance: 1, now: NOW });

    expect(status).toBe('scheduled');
    expect(capability.calls).toContain('ensureChannel');
    expect(capability.scheduled).toHaveLength(1);
    expect(capability.scheduled[0]).toMatchObject({
      identifier: OUTSTANDING_REMINDER_ID,
      title: 'Settle up in BillLens',
      body: 'One group still has an outstanding balance.',
      seconds: 86_400,
    });
    expect(store.records.get(OUTSTANDING_REMINDER_ID)).toMatchObject({
      status: 'scheduled',
      delivery: 'native',
      groupsWithBalance: 1,
      scheduledAt: '2026-10-24T10:00:00.000Z',
    });
  });

  it('does not reschedule an identical pending notification', async () => {
    const capability = new FakeCapability();
    const { useCase } = build(capability);
    capability.existing = [
      {
        identifier: OUTSTANDING_REMINDER_ID,
        title: 'Settle up in BillLens',
        body: '2 groups still have outstanding balances.',
      },
    ];

    const status = await useCase.execute({ enabled: true, groupsWithBalance: 2, now: NOW });

    expect(status).toBe('scheduled');
    expect(capability.scheduled).toHaveLength(0);
    expect(capability.calls).not.toContain(`cancel:${OUTSTANDING_REMINDER_ID}`);
  });

  it('replaces a stale reminder whose copy no longer matches', async () => {
    const capability = new FakeCapability();
    const { useCase } = build(capability);
    capability.existing = [
      {
        identifier: OUTSTANDING_REMINDER_ID,
        title: 'Settle up in BillLens',
        body: '3 groups still have outstanding balances.',
      },
    ];

    const status = await useCase.execute({ enabled: true, groupsWithBalance: 1, now: NOW });

    expect(status).toBe('scheduled');
    expect(capability.scheduled).toHaveLength(1);
  });

  it('reports "unsupported" when the runtime cannot actually schedule', async () => {
    const capability = new FakeCapability({ scheduleResult: 'unavailable' });
    const { useCase, store } = build(capability);

    const status = await useCase.execute({ enabled: true, groupsWithBalance: 1, now: NOW });

    expect(status).toBe('unsupported');
    expect(store.records.get(OUTSTANDING_REMINDER_ID)?.delivery).toBe('stored_only');
  });

  it('never throws when the native bridge fails', async () => {
    const capability = new FakeCapability({ failPermission: true });
    const { useCase, store } = build(capability);

    const status = await useCase.execute({ enabled: true, groupsWithBalance: 1, now: NOW });

    expect(status).toBe('error');
    expect(store.records.get(OUTSTANDING_REMINDER_ID)?.status).toBe('error');
  });

  it('keeps the evaluated status when persistence fails', async () => {
    const capability = new FakeCapability();
    const store = new FakeStore();
    store.failSave = true;
    const { useCase } = build(capability, store);

    await expect(
      useCase.execute({ enabled: true, groupsWithBalance: 1, now: NOW }),
    ).resolves.toBe('scheduled');
  });
});
