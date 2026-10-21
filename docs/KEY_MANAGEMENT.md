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

## Invitations

- 32-byte bearer token, SHA-256 hash stored by the relay/inviter.
- No group key or key id in the token, URL or QR code.
- After joining, the new device registers its X25519 key and an existing member
  wraps the current group key to it (out-of-band in the current library; no UI
  yet).

## Limits

- **No recovery:** losing the device seed loses access to wrapped group keys.
  Another member must re-wrap for the new device.
- **No forward secrecy within an epoch:** any device holding the group key can
  read all events of that epoch. Rotation is the boundary.
- **Relay sees metadata:** group id, device ids, event ids, timestamps, sizes.
- **Not independently audited as a system.** Primitives come from Noble
  (audited libraries); the composition has not had a third-party review.
