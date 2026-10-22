/**
 * Refresh the on-device "settle up" reminder.
 *
 * This use case owns the *decision*; the injected ports own the platform
 * and the storage. That split is what keeps a missing native module from
 * breaking anything: when the current runtime cannot schedule a
 * notification, the decision is still evaluated and persisted, and the
 * caller gets a truthful status instead of a thrown error.
 *
 * Rules:
 *   - one stable identifier — rescheduling replaces, never duplicates;
 *   - never re-schedule an identical pending notification (idempotent
 *     across app resumes and repeated hook runs);
 *   - cancel as soon as the book is settled, reminders are switched off,
 *     or permission is gone;
 *   - persistence is best-effort and never blocks the returned status.
 */

import type {
  LocalNotificationPort,
  OutstandingReminderStatus,
  OutstandingReminderStore,
  ReminderDelivery,
} from './notification-capability.port';

/** Stable OS-level identifier for the daily outstanding-balance nudge. */
export const OUTSTANDING_REMINDER_ID = 'billlens.outstanding-balances';

const REMINDER_TITLE = 'Settle up in BillLens';
const DAY_SECONDS = 24 * 60 * 60;
const DAY_MS = DAY_SECONDS * 1000;

export interface RefreshOutstandingReminderInput {
  /** User preference. When false the native reminder is cancelled. */
  readonly enabled: boolean;
  /** Number of groups that still have at least one suggested transfer. */
  readonly groupsWithBalance: number;
  /** Injectable clock for tests. */
  readonly now?: Date;
}

export interface RefreshOutstandingReminderDeps {
  readonly capability: LocalNotificationPort;
  readonly store: OutstandingReminderStore;
  /** Override for tests; defaults to {@link OUTSTANDING_REMINDER_ID}. */
  readonly identifier?: string;
}

export class RefreshOutstandingReminderUseCase {
  constructor(private readonly deps: RefreshOutstandingReminderDeps) {}

  async execute(input: RefreshOutstandingReminderInput): Promise<OutstandingReminderStatus> {
    try {
      return await this.evaluate(input);
    } catch (error) {
      // Never let a notification failure escape into a screen or a
      // financial flow. The message is a state, not payload data.
      console.warn(
        '[Reminders] scheduling failed:',
        error instanceof Error ? error.message : 'unknown',
      );
      await this.persist({
        status: 'error',
        delivery: 'none',
        groupsWithBalance: Math.max(0, input.groupsWithBalance),
        now: input.now ?? new Date(),
        scheduledAt: null,
      });
      return 'error';
    }
  }

  private async evaluate(
    input: RefreshOutstandingReminderInput,
  ): Promise<OutstandingReminderStatus> {
    const identifier = this.deps.identifier ?? OUTSTANDING_REMINDER_ID;
    const now = input.now ?? new Date();
    const groups = Math.max(0, input.groupsWithBalance);

    if (!input.enabled) {
      await this.deps.capability.cancel(identifier);
      return this.persist({
        status: 'disabled',
        delivery: 'none',
        groupsWithBalance: groups,
        now,
        scheduledAt: null,
      });
    }

    if (groups === 0) {
      await this.deps.capability.cancel(identifier);
      return this.persist({
        status: 'none',
        delivery: 'none',
        groupsWithBalance: 0,
        now,
        scheduledAt: null,
      });
    }

    const availability = this.deps.capability.availability();
    if (availability !== 'available') {
      // Expo Go / web: the reminder is real, the notification is not. It
      // stays in SQLite so a build that supports it can deliver it later.
      return this.persist({
        status: 'unsupported',
        delivery: 'stored_only',
        groupsWithBalance: groups,
        now,
        scheduledAt: null,
      });
    }

    let permission = await this.deps.capability.permission();
    if (permission === 'undetermined') {
      permission = await this.deps.capability.requestPermission();
    }
    if (permission !== 'granted') {
      await this.deps.capability.cancel(identifier);
      if (permission === 'unavailable') {
        // Runtime claimed support but the module is not usable (for
        // example a native build missing the module after an OTA).
        return this.persist({
          status: 'unsupported',
          delivery: 'stored_only',
          groupsWithBalance: groups,
          now,
          scheduledAt: null,
        });
      }
      return this.persist({
        status: 'denied',
        delivery: 'none',
        groupsWithBalance: groups,
        now,
        scheduledAt: null,
      });
    }

    await this.deps.capability.ensureChannel();

    const body = bodyFor(groups);
    const scheduledAt = new Date(now.getTime() + DAY_MS).toISOString();
    const existing = (await this.deps.capability.listScheduled()).find(
      (entry) => entry.identifier === identifier,
    );

    // Duplicate protection: an identical pending reminder is left alone,
    // so opening the app ten times does not churn the OS schedule.
    if (existing !== undefined && existing.body === body) {
      return this.persist({
        status: 'scheduled',
        delivery: 'native',
        groupsWithBalance: groups,
        now,
        scheduledAt,
      });
    }

    if (existing !== undefined) {
      // Stale copy (the balance count changed) — cancel before replacing.
      await this.deps.capability.cancel(identifier);
    }

    const result = await this.deps.capability.schedule({
      identifier,
      title: REMINDER_TITLE,
      body,
      data: { route: '/(tabs)/activity' },
      seconds: DAY_SECONDS,
    });

    if (result === 'unavailable') {
      return this.persist({
        status: 'unsupported',
        delivery: 'stored_only',
        groupsWithBalance: groups,
        now,
        scheduledAt: null,
      });
    }

    return this.persist({
      status: 'scheduled',
      delivery: 'native',
      groupsWithBalance: groups,
      now,
      scheduledAt,
    });
  }

  /**
   * Store the decision. A storage failure downgrades the *delivery* but
   * never changes the evaluated status, and never throws.
   */
  private async persist(input: {
    readonly status: OutstandingReminderStatus;
    readonly delivery: ReminderDelivery;
    readonly groupsWithBalance: number;
    readonly now: Date;
    readonly scheduledAt: string | null;
  }): Promise<OutstandingReminderStatus> {
    const identifier = this.deps.identifier ?? OUTSTANDING_REMINDER_ID;
    try {
      await this.deps.store.save({
        id: identifier,
        status: input.status,
        delivery: input.delivery,
        groupsWithBalance: input.groupsWithBalance,
        evaluatedAt: input.now.toISOString(),
        scheduledAt: input.scheduledAt,
      });
    } catch (error) {
      console.warn(
        '[Reminders] could not persist reminder state:',
        error instanceof Error ? error.message : 'unknown',
      );
    }
    return input.status;
  }
}

function bodyFor(groupsWithBalance: number): string {
  return groupsWithBalance === 1
    ? 'One group still has an outstanding balance.'
    : `${groupsWithBalance} groups still have outstanding balances.`;
}
