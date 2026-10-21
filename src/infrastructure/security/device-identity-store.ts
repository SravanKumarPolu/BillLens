/**
 * Durable per-device cryptographic identity.
 *
 * The 32-byte seed that derives both key pairs is stored in SecureStore
 * (Keychain / Keystore) — never in AsyncStorage, SQLite or an export.
 * On first launch a seed is generated; later launches load the same key.
 *
 * Losing this seed loses the ability to decrypt group keys wrapped to this
 * device. That is intentional (no server-side recovery); another member
 * must re-wrap the group key for the new device.
 */

import type { SecureStorage } from '@domain/ports/secure-storage.port';
import {
  createDeviceIdentity,
  fromHex,
  toHex,
  type DeviceIdentity,
  type DevicePublicIdentity,
} from '@domain/sync-crypto';

export const DEVICE_IDENTITY_SEED_KEY = 'billlens.sync.device_seed.v1';

export type SeedGenerator = () => Uint8Array;

export class DeviceIdentityStore {
  constructor(
    private readonly secureStorage: SecureStorage,
    /**
     * Secure randomness. Production MUST pass
     * `() => getRandomBytes(32)` from expo-crypto; tests pass a fixed seed.
     * There is deliberately no `Math.random` fallback.
     */
    private readonly randomSeed?: SeedGenerator,
  ) {}

  /**
   * Load the device identity, creating and persisting a seed on first run.
   * A malformed stored seed is replaced (and therefore invalidates old
   * group-key wraps) rather than throwing the app into a boot loop.
   */
  async loadOrCreate(): Promise<DeviceIdentity> {
    const stored = await this.secureStorage.get(DEVICE_IDENTITY_SEED_KEY);
    if (stored !== null) {
      try {
        const seed = fromHex(stored);
        if (seed.length === 32) return createDeviceIdentity(seed);
      } catch {
        // fall through to regeneration
      }
    }
    const seed = this.generateSeed();
    const identity = createDeviceIdentity(seed);
    await this.secureStorage.set(DEVICE_IDENTITY_SEED_KEY, toHex(seed));
    return identity;
  }

  private generateSeed(): Uint8Array {
    if (this.randomSeed !== undefined) {
      const seed = this.randomSeed();
      if (seed.length !== 32) throw new Error('Seed generator must return 32 bytes.');
      return seed;
    }
    // Web / Node with WebCrypto. Hermes does not guarantee global crypto,
    // so production injects expo-crypto instead of relying on this branch.
    const cryptoObj = (globalThis as { crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array } })
      .crypto;
    if (typeof cryptoObj?.getRandomValues === 'function') {
      const seed = new Uint8Array(32);
      cryptoObj.getRandomValues(seed);
      return seed;
    }
    throw new Error(
      'No secure random source available. Inject expo-crypto getRandomBytes into DeviceIdentityStore.',
    );
  }

  async publicIdentity(): Promise<DevicePublicIdentity> {
    const identity = await this.loadOrCreate();
    return {
      deviceId: identity.deviceId,
      signingPublicKey: toHex(identity.signing.publicKey),
      encryptionPublicKey: toHex(identity.encryption.publicKey),
    };
  }
}
