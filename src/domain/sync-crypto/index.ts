/** Encrypted group-sync primitives (envelopes, device identity, group keys). */
export {
  bytesToUtf8,
  canonicalJson,
  fromHex,
  sameJson,
  toHex,
  utf8ToBytes,
} from './encoding';
export {
  createDeviceIdentity,
  deviceIdFromPublicKey,
  publicIdentity,
  signBytes,
  verifyBytes,
  type DeviceIdentity,
  type DevicePublicIdentity,
  type KeyPair,
} from './device-identity';
export {
  GroupKeyring,
  generateGroupKey,
  unwrapGroupKey,
  wrapGroupKey,
  type GroupKey,
  type WrappedGroupKey,
} from './group-key';
export {
  ENVELOPE_VERSION,
  assertFreshness,
  createEncryptedEvent,
  eventDigest,
  openEncryptedEvent,
  verifyEventSignature,
  type CreateEventInput,
  type EncryptedSyncEvent,
  type OpenEventInput,
  type OpenedSyncEvent,
  type SyncEventHeader,
} from './envelope';
