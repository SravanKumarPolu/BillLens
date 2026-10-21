# Encrypted sync protocol (v1)

**Status: implemented and tested in Node; NOT wired into the app and NOT
deployed.** The production app still uses the optional Supabase relay. This
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

## What is not implemented

- **No app wiring.** The engine is a tested library; screens do not yet submit
  or pull encrypted events.
- **No conflict resolution for encrypted events.** The engine applies events in
  order; entity version conflicts are currently handled only by the Supabase
  path. Any production rollout must add the same explicit conflict rules.
- **No persistent processed-id table.** The engine accepts an injected set; the
  app must persist it (a table is the obvious place).
- **No physical two-device test.** Verified with two independent device
  identities, two separate SQLite files and the reference relay in Node.
- **No key recovery.** Losing the device seed means group keys wrapped to it
  cannot be unwrapped; another member must re-wrap for the new device.
