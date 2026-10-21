# Data retention and deletion

## Group retention (local)

- Default **365 days** of inactivity; configurable to 6 or 24 months in
  Settings → Data & storage.
- Inactivity is measured from the latest local financial activity.
- A group is only *eligible* when it also has: zero outstanding balances, zero
  settlements awaiting confirmation, zero unsynced local changes (cloud mode).
- Nothing is deleted automatically. Protected groups explain why.
- Export (JSON/CSV) is offered before deletion.

## Deletion scopes

| Action | Scope | Guards |
|---|---|---|
| Leave group | hides it locally, keeps rows | none |
| Remove local copy | hard-deletes local rows (cascade) | no cloud sync, no balances, no pending confirmation; audit entry |
| Delete account | server request + local wipe after 14-day window | explicit confirmation |
| Void expense | soft delete (`deleted_at`), balances recalculate, audit entry | owner/admin or creator only |
| Relay event expiry | ciphertext only | TTL (reference: 30 days) |

Deleting a local copy never deletes another member's records and never enqueues
a shared deletion. Shared deletion remains an explicit owner action in the
cloud path (tombstone + sync op).

## Relay retention

Envelopes are temporary transport, not a backup. The reference relay expires
them after 30 days (configurable) and caps 5,000 events per group. A device
that is offline longer than the TTL must obtain a fresh snapshot/key from a
member — this is not implemented yet.

## Not implemented

- Receipt-image / OCR-draft / temporary-export cache clearing is only part of
  the full account wipe; there is no granular cache screen yet.
- Delete-all-local-data is reachable through account deletion; a standalone
  local-only wipe action is not exposed.
- Retention warnings appear in Settings → Data & storage, not as a dashboard
  banner.

## Clock trust

Local retention uses the device clock for *eligibility only*; deletion is
manual. Shared expiry must use relay/server timestamps (the relay stores
`receivedAt`); do not use a peer's device clock for shared decisions.
