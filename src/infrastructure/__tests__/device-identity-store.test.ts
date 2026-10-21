/** Device identity persistence in SecureStore (in-memory double). */

import { describe, expect, it } from '@jest/globals';

import type { SecureStorage } from '@domain/ports/secure-storage.port';
import {
  DEVICE_IDENTITY_SEED_KEY,
  DeviceIdentityStore,
} from '@infrastructure/security/device-identity-store';

class MemorySecureStorage implements SecureStorage {
  readonly values = new Map<string, string>();
  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
  async has(key: string): Promise<boolean> {
    return this.values.has(key);
  }
}

describe('DeviceIdentityStore', () => {
  it('persists one identity across reloads', async () => {
    const secure = new MemorySecureStorage();
    const first = await new DeviceIdentityStore(secure, () => new Uint8Array(32).fill(5)).loadOrCreate();
    const second = await new DeviceIdentityStore(secure, () => new Uint8Array(32).fill(6)).loadOrCreate();

    expect(second.deviceId).toBe(first.deviceId);
    expect(secure.values.has(DEVICE_IDENTITY_SEED_KEY)).toBe(true);
    // Only the seed is stored — never the private keys in plaintext form.
    expect(secure.values.get(DEVICE_IDENTITY_SEED_KEY)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('regenerates when the stored seed is malformed', async () => {
    const secure = new MemorySecureStorage();
    await secure.set(DEVICE_IDENTITY_SEED_KEY, 'not-hex');
    const identity = await new DeviceIdentityStore(secure, () => new Uint8Array(32).fill(7)).loadOrCreate();
    expect(identity.deviceId).toMatch(/^[0-9a-f]{64}$/);
    expect(secure.values.get(DEVICE_IDENTITY_SEED_KEY)).toMatch(/^[0-9a-f]{64}$/);
  });
});
