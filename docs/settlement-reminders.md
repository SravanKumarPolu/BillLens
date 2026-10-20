# BillLens — Settlement Reminders

> Status: **Phase 6 · Track 6 — Settlement reminder entity, scheduling rules, and five use cases implemented.**
> Companion documents: [`settlement-domain.md`](./settlement-domain.md), [`settlement-lifecycle.md`](./settlement-lifecycle.md), [`settlement-confirmation.md`](./settlement-confirmation.md).

## 1. Overview

Settlement reminders are respectful payment follow-up notifications. The spec (Prompt 59) requires:

- One-time reminders, scheduled reminders, settlement-request reminders, pending-confirmation reminders, dispute follow-ups, group settlement summaries.
- Cool-down period (no more than one reminder within a defined period).
- User-controlled cadence.
- Quiet-hour support.
- Easy cancellation.
- Stop reminders when balance is settled.
- Stop reminders when settlement is disputed.
- Stop reminders when member access is removed.
- Neutral wording (no shame-oriented language).
- Notification privacy modes (private, detailed, in-app only, disabled).

Track 6 implements all of the above as pure domain modules and application-layer use cases.

## 2. The entity

`SettlementReminder` (in `src/domain/entities/settlement-reminder.ts`) stores:

| Field | Type | Description |
|---|---|---|
| `id` | `ReminderId` | Unique identifier |
| `groupId` | `GroupId` | The group this reminder belongs to |
| `settlementId` | `SettlementId?` | Optional link to a specific settlement |
| `payerMemberId` | `MemberId?` | The member being reminded to pay |
| `receiverMemberId` | `MemberId?` | The member who set the reminder |
| `currencyCode` | `CurrencyCode` | The currency of the balance being reminded about |
| `amountMinor` | `number?` | Optional amount (for display) |
| `reminderType` | `ReminderType` | One of 6 types (see below) |
| `scheduledAt` | `DateTime` | When the reminder should fire |
| `status` | `ReminderStatus` | `scheduled`, `sent`, `cancelled`, `failed`, `no_longer_needed` |
| `privacyMode` | `ReminderPrivacyMode` | Frozen at scheduling time |
| `createdBy` | `UserId` | Who created the reminder |
| `sentAt` | `DateTime?` | When the notification was dispatched |
| `cancelledAt` | `DateTime?` | When it was cancelled |
| `autoCancelReason` | `AutoCancelReason?` | Why it was auto-cancelled |

### 2.1 Reminder types

| Type | Code | Use case |
|---|---|---|
| One-time | `one_time` | A single reminder |
| Scheduled | `scheduled` | A recurring reminder at a fixed cadence |
| Settlement request | `settlement_request` | Asking someone to settle |
| Pending confirmation | `pending_confirmation` | Reminding the receiver to confirm |
| Dispute follow-up | `dispute_follow_up` | Following up on a disputed settlement |
| Group summary | `group_summary` | A summary of the group's open balances |

### 2.2 Privacy modes

| Mode | Code | Lock-screen behaviour |
|---|---|---|
| Private | `private` | Hides the amount; says "A balance is still open" |
| Detailed | `detailed` | Includes the amount and group name |
| In-app only | `in_app_only` | No push notification; appears only when the app is open |
| Disabled | `disabled` | No notification at all (stored for audit only) |

Privacy mode is **frozen at scheduling time** so later changes to user preferences do not retroactively alter already-sent notifications.

## 3. The scheduling rules module

`reminder-scheduling-rules.ts` (in `src/domain/services/reminders/`) is a pure module with no side effects:

### 3.1 Cool-down

`isWithinCoolDown(now, scheduledAt, lastReminderAt, coolDownHours)` — returns `true` if the new reminder would violate the cool-down period relative to the most recent scheduled-or-sent reminder for the same (payer, receiver, group, currency) tuple. Default cool-down: 24 hours.

### 3.2 Quiet hours

`isWithinQuietHours(hour, window)` — checks whether a given hour-of-day falls within a quiet-hours window. Handles wrap-across-midnight (e.g. 22:00–07:00).

`scheduledInQuietHours(userLocalHour, window)` — checks whether a scheduled time falls in quiet hours.

`delayPastQuietHours(userLocalHour, window)` — returns the first non-quiet hour after the window ends.

### 3.3 Neutral wording

`buildNeutralReminderMessage({ groupName, formattedAmount, privacyMode })` — produces the spec's example wording:

```
Reminder from the Weekend Trip group:
A balance of £24 is still open.
Open BillLens to review the details.
```

In private mode, the amount is hidden:

```
Reminder from the Weekend Trip group.
A balance is still open.
Open BillLens to review the details.
```

`containsShameLanguage(text)` — returns `true` if the text contains forbidden phrases like "You still haven't paid", "Pay immediately", "Everyone is waiting", "overdue", "late payer", "deadbeat". Used by tests and by the UI to validate user-customised templates.

## 4. The five use cases

### 4.1 CreateSettlementReminderUseCase

Schedules a new reminder. Enforces the cool-down period: if a prior scheduled-or-sent reminder for the same (payer, receiver, currency) tuple exists within the cool-down window, throws `InvalidEntityError`. The cool-down is configurable (default 24 hours). The privacy mode is frozen at scheduling time.

### 4.2 CancelSettlementReminderUseCase

Manual cancellation. Sets status to `cancelled` and records `cancelledAt`. Idempotent — if the reminder is already cancelled or no-longer-needed, returns without error.

### 4.3 ListSettlementRemindersUseCase

Lists reminders for a group, optionally filtered by status. Ordered by `scheduledAt` ASC.

### 4.4 ReconcileReminderStateUseCase

The auto-cancellation engine. Provides three methods:

- `onSettlementStateChanged(settlementId, reason)` — auto-cancels all scheduled reminders linked to a settlement that completed or was disputed.
- `onMemberRemoved(groupId, payerMemberId)` — auto-cancels all scheduled reminders for a removed member.
- `onGroupDeleted(groupId)` — auto-cancels all scheduled reminders for a deleted group.

Each auto-cancellation sets `status = 'no_longer_needed'`, `autoCancelReason`, and `cancelledAt`. The use case is idempotent — already-cancelled reminders are skipped.

### 4.5 GenerateGroupSettlementSummaryUseCase

Builds a neutral group summary message using the multi-currency balance engine (Track 3). For each currency with unsettled balances, produces a message like:

```
Weekend Trip: 3 members have open balances totaling ₹42.50.
Open BillLens to review the details.
```

The summary does NOT name specific members or their individual balances — only the count and the total, for privacy.

## 5. Testing

- **`reminder-scheduling-rules.test.ts`** — 20 tests: cool-down (no prior, gap exceeds, gap within, custom period), quiet hours (zero-width, simple range, wrap-across-midnight, invalid hour), neutral wording (private mode, detailed mode), shame language detection (forbidden phrases, neutral wording, case-insensitive).
- **`settlement-reminder.test.ts`** — 20 tests: factory (defaults, custom privacy mode, invalid type, invalid privacy mode, payer=receiver, non-positive amount, past scheduledAt, payer-only), cancel (status=cancelled, already-cancelled error), autoCancel (reason, invalid reason, non-scheduled error), markSent, isScheduled predicate.
- **`reminder-usecases.test.ts`** — 23 tests: create (scheduled, cool-down violation, after cool-down, missing payer+receiver), cancel (cancelled, idempotent, sent error, not-found), list (list for group, filter by status), reconcile (settle_completed, dispute_opened, does-not-cancel-sent, member_removed, group_deleted, idempotent).

Total: **63 new tests across 3 new test suites**.

## 6. References

- `src/domain/entities/settlement-reminder.ts` — the entity.
- `src/domain/services/reminders/reminder-scheduling-rules.ts` — cool-down, quiet hours, neutral wording.
- `src/domain/repositories/settlement-reminder.repository.ts` — the repository contract.
- `src/application/reminders/` — the five use cases.
- `src/application/reminders/__tests__/reminder-usecases.test.ts` — 23 use case tests.
- `src/domain/services/reminders/__tests__/reminder-scheduling-rules.test.ts` — 20 scheduling-rules tests.
- `src/domain/entities/__tests__/settlement-reminder.test.ts` — 20 entity tests.
- `supabase/migrations/202610101500_phase6_track1_settlement_state_machine.sql` — the `settlement_reminders` table (created in Track 1's migration).
- [`settlement-confirmation.md`](./settlement-confirmation.md) — the confirmation flow (reminders stop when confirmed).
- [`settlement-lifecycle.md`](./settlement-lifecycle.md) — the state machine (reminders stop on state changes).
