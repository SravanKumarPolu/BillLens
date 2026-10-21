# Encrypted sync protocol (v1)

**Status: core, persistence, conflicts and key delivery implemented and tested
in Node; still NOT wired into the app UI and NOT deployed.** The production app still uses the optional Supabase relay. This
document describes the protocol that is implemented under
`src/domain/sync-crypto`, `src/application/sync` and
`src/infrastructure/relay-reference`.

## Goals

- Each phone owns a SQLite database as the primary record.
- The relay stores only opaque envelopes, with short retention.
- A group member can verify who sent an event without the relay being able to
  read it.
- Duplicate delivery never duplicates financial effects.

## Event envelope

```
{
  header: { v: 1, groupId, eventId, deviceId, keyId, createdAt },
  nonce: hex(24 bytes),
  ciphertext: hex,
  signature: hex(64 bytes)
}
```

- **Encryption:** XChaCha20-Poly1305 with a per-group 32-byte key. The header is
  the AEAD associated data, so metadata cannot be altered without failing
  decryption.
- **Authenticity:** Ed25519 over
  `SHA-256(canonical(header) || nonce || ciphertext)`. `deviceId` is the
  SHA-256 of the signing public key; the receiver checks that binding before
  decrypting.
- **Payload:** JSON object inside the ciphertext, e.g.
  `{ type: "expense.created", expense: { id, title, amountMinor, ... } }`.
- **Replay/idempotency:** `eventId` is the idempotency key; `eventDigest`
  covers the whole envelope. Receivers keep a processed-id set and refuse
  duplicates; the relay also dedupes by `eventId`.
- **Freshness:** events older than 30 days (or >5 minutes in the future) are
  rejected client-side.

## Flow

1. Mutation saved to SQLite and its sync event committed atomically (existing
   `sync_operations` queue).
2. Device encrypts the payload with the current group-key epoch.
3. Signed envelope queued for upload.
4. Relay verifies membership, sender device and signature; stores ciphertext.
5. Other devices fetch envelopes they have not acknowledged.
6. Receiver verifies sender binding + signature, decrypts, checks freshness,
   applies idempotently.
7. Receiver acknowledges; relay stops returning that event to it.
8. Relay expires unacknowledged events after its TTL.

## Membership and keys

- Each device has an Ed25519 signing key and an X25519 encryption key.
- A group key is distributed by wrapping it to each member device's X25519
  public key (ECDH + HKDF-SHA256 + XChaCha20-Poly1305).
- Removing a member means: remove on relay, rotate the group key, wrap the new
  epoch only for remaining devices. Old epochs stay readable for history.
- Invitations are bearer tokens with a SHA-256 hash stored server-side; they
  contain **no key material**.

## Durability (migration 0008)

`sync_processed_events` records `applying → processed | failed | conflict`.
Apply is idempotent by client-generated ids; a crash during apply re-runs the
same event safely. Acknowledgements are written only after `processed`, and
re-acknowledging is a no-op. Cursors, device membership, key epochs and
conflict records are persisted in the same schema.

Conflicts: when an incoming expense disagrees with local financial fields
(amount, currency, payer shares, participants), `assertExpenseEventApplicable`
throws `FinancialConflictError`. The engine writes a `sync_event_conflicts`
row and marks the event `conflict` without applying it. A reviewer resolves
with `keep_local` or `accept_remote`; the local expense is untouched until a
deliberate resolution path applies it (not yet built).

## Invitations and key delivery

The relay now has an invitation hash registry (`POST /invites`), a one-time
`POST /join`, and a per-device keybox (`POST/GET/DELETE /keys`). Invitees
register a device key, redeem the token, then an existing member wraps the
current group key to that device. The raw group key never appears in the
token or URL.

## What is not implemented

- **No app wiring.** The engine and access service are tested libraries; screens
  do not yet submit or pull encrypted events.
- **Conflict review UI/resolution apply is not built** — records are persisted,
  but accepting a remote payload is not wired.

- **No physical two-device test.** Verified with two independent device
  identities, two separate SQLite files and the reference relay in Node.
- **No key recovery.** Losing the device seed means group keys wrapped to it
  cannot be unwrapped; another member must re-wrap for the new device.
