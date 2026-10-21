# Key management

## Device identity

- 32-byte seed stored in SecureStore (`billlens.sync.device_seed.v1`).
- Ed25519 signing key + X25519 encryption key derived from it
  (`src/domain/sync-crypto/device-identity.ts`).
- `deviceId` = SHA-256(signing public key). Public keys are registered with the
  relay; private keys never leave the device.
- Malformed stored seeds are regenerated, which invalidates old key wraps.

## Group keys

- One 32-byte XChaCha20-Poly1305 key per epoch; `keyId` is a public hash prefix.
- Distribution: `wrapGroupKey(groupKey, recipientX25519PublicKey)` — ephemeral
  X25519 + HKDF-SHA256 + AEAD, bound to the recipient's public key.
- `GroupKeyring` keeps old epochs for history and rotates to a new one.
- **Removing a member:** relay removal (creator only) + rotate + re-wrap for
  remaining devices. Not automated yet.

## Invitations and joining

1. An existing member creates a token; the relay stores only its SHA-256 hash
   and expiry.
2. The invitee registers its device public keys and redeems the token once via
   `POST /join`; the relay adds it to the group.
3. An existing member wraps the current group key to the invitee's X25519 key
   and leaves the wrap in the relay keybox.
4. The invitee fetches, unwraps (only it can), stores the epoch metadata and
   deletes the mailbox entry.

No cloud account is required: membership is authorised by an existing member
plus the one-time token, and requests are signed by device keys.

## Revocation and recovery

- `revokeMember`: relay removal (creator only), membership marked `removed`,
  key rotation, re-wrap of the new epoch for remaining devices. The removed
  device cannot fetch and never receives the new key.
- `recoverForDevice`: any member that still holds the key re-wraps it for the
  new device. A fresh install with no member online cannot recover — the
  service throws rather than inventing key material.

## Limits

- **No recovery:** losing the device seed loses access to wrapped group keys.
  Another member must re-wrap for the new device.
- **No forward secrecy within an epoch:** any device holding the group key can
  read all events of that epoch. Rotation is the boundary.
- **Relay sees metadata:** group id, device ids, event ids, timestamps, sizes.
- **Not independently audited as a system.** Primitives come from Noble
  (audited libraries); the composition has not had a third-party review.
