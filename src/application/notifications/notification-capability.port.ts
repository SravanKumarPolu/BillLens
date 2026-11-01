/**
 * Notification capability ports — Phase 10 notification hardening.
 *
 * The application layer decides *whether* a local reminder is due; the
 * infrastructure layer decides *whether the current runtime can deliver
 * it*. These contracts are the only thing the two sides share:
 *
 *   - no `expo-*` import may appear in this file (application layer rule);
 *   - every method is total — adapters return a state, they never throw,
 *     so a missing native module can never abort app startup or a
 *     financial operation;
 *   - the outcome is always persisted through `OutstandingReminderStore`,
 *     so the reminder survives a restart even when the device cannot
 *     schedule a notification right now.
 *
 * Runtime matrix (see `docs/notification-architecture.md`):
 *
 * | Runtime                    | Local scheduling | Remote push |
 * |----------------------------|------------------|-------------|
 * | Web                        | unsupported      | unsupported |
 * | Expo Go (Android/iOS)       | unavailable      | unavailable |
 * | Development / release build | available        | opt-in      |
 */

// ---------------------------------------------------------------------------
// Local notifications
// ---------------------------------------------------------------------------

/**
 * Whether this runtime can schedule on-device notifications at all.
 *
 * `expo-go` is deliberately distinct from `unsupported`: in Expo Go the
 * reminder is still evaluated and stored, it just cannot be presented.
 */
export type NotificationAvailability = 'available' | 'unsupported' | 'expo-go';

/**
 * Normalised permission state.
 *
 *   - `granted`       — the OS will present notifications
 *   - `denied`        — the user said no and the OS will not ask again
 *   - `undetermined`  — not decided yet; the app may still ask
 *   - `unavailable`   — no notification module in this runtime
 */
export type NotificationPermissionState = 'granted' | 'denied' | 'undetermined' | 'unavailable';

/** A reminder the OS currently has scheduled. */
export interface ScheduledLocalNotification {
  readonly identifier: string;
  readonly title: string;
  readonly body: string;
}

export interface LocalNotificationRequest {
  /** Stable identifier — rescheduling with the same id replaces, never duplicates. */
  readonly identifier: string;
  readonly title: string;
  readonly body: string;
  /** Small routing payload. Never contains receipt text or amounts. */
  readonly data?: Readonly<Record<string, string>>;
  /** Fire this many seconds after scheduling. */
  readonly seconds: number;
}

/** Result of a scheduling attempt. `unavailable` means "stored, not shown". */
export type LocalNotificationScheduleResult = 'scheduled' | 'unavailable';

export interface LocalNotificationPort {
  /** Synchronous runtime check — cheap enough for render paths. */
  availability(): NotificationAvailability;

  /** Read the current permission without prompting. */
  permission(): Promise<NotificationPermissionState>;

  /** Prompt when the OS still allows it; otherwise returns the current state. */
  requestPermission(): Promise<NotificationPermissionState>;

  /** Create/refresh the Android notification channel (no-op elsewhere). */
  ensureChannel(): Promise<void>;

  /** All notifications the OS currently has scheduled. */
  listScheduled(): Promise<readonly ScheduledLocalNotification[]>;

  schedule(request: LocalNotificationRequest): Promise<LocalNotificationScheduleResult>;

  /** Cancel by identifier. Idempotent — a missing id is not an error. */
  cancel(identifier: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Reminder persistence
// ---------------------------------------------------------------------------

export type OutstandingReminderStatus =
  | 'scheduled'
  | 'none'
  | 'denied'
  | 'unsupported'
  | 'disabled'
  | 'error';

/**
 * How the reminder decision was delivered.
 *
 *   native       — evaluated, permission granted, notification scheduled
 *   stored_only  — evaluated and stored, but this runtime cannot present it
 *   none         — nothing to remind about (or reminders are off)
 */
export type ReminderDelivery = 'native' | 'stored_only' | 'none';

/**
 * Durable record of the last outstanding-reminder decision.
 *
 * Deliberately carries no notification body and no financial payload:
 * a count is enough to reconcile, and nothing sensitive is stored twice.
 */
export interface OutstandingReminderRecord {
  readonly id: string;
  readonly status: OutstandingReminderStatus;
  readonly delivery: ReminderDelivery;
  readonly groupsWithBalance: number;
  /** ISO-8601 timestamp of the evaluation that produced this record. */
  readonly evaluatedAt: string;
  /** ISO-8601 timestamp of the next native fire time, when one exists. */
  readonly scheduledAt: string | null;
}

export interface OutstandingReminderStore {
  load(id: string): Promise<OutstandingReminderRecord | null>;
  save(record: OutstandingReminderRecord): Promise<void>;
  clear(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Remote push
// ---------------------------------------------------------------------------

/**
 * Push is optional and disabled by default: BillLens is local-first and
 * must work with no cloud configuration at all. Registration is only
 * allowed in a development/release build that has an EAS project id.
 */
export type RemotePushStatus =
  | 'registered'
  | 'disabled'
  | 'unsupported-platform'
  | 'expo-go'
  | 'not-configured'
  | 'denied'
  | 'error';

export interface RemotePushRegistration {
  readonly status: RemotePushStatus;
  /** Opaque Expo push token; present only when `status === 'registered'`. */
  readonly token?: string;
}

export interface RemotePushPort {
  register(options: { readonly enabled: boolean }): Promise<RemotePushRegistration>;
}
