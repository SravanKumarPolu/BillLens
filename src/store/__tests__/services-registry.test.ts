import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import type { AppServices } from '@infrastructure/composition-root';
import { createCompositionRoot } from '@infrastructure/composition-root';

import { InMemoryDatabase } from '../../infrastructure/__tests__/in-memory-database';
import { runMigrations } from '../../infrastructure/sqlite/schema';
import {
  configureAppServicesFactory,
  getAppServices,
  getServicesStatus,
  initAppServices,
  resetAppServices,
  setAppServicesForTesting,
  startSyncCoordinator,
  stopSyncCoordinator,
  tryGetAppServices,
} from '../services-registry';

/**
 * Services registry tests.
 *
 * The registry's PRODUCTION path (opening the real expo-sqlite database)
 * requires a device runtime, so these tests exercise the registry logic
 * through the injectable factory seam — the same mechanism the app uses,
 * minus the native driver.
 */

async function makeInMemoryServices(): Promise<AppServices> {
  const db = new InMemoryDatabase();
  await runMigrations(db);
  return createCompositionRoot({ database: db });
}

describe('services registry', () => {
  beforeEach(() => {
    resetAppServices();
    configureAppServicesFactory(null);
  });

  afterEach(() => {
    resetAppServices();
    configureAppServicesFactory(null);
  });

  it('starts idle with no services available', () => {
    expect(getServicesStatus()).toBe('idle');
    expect(tryGetAppServices()).toBeNull();
    expect(() => getAppServices()).toThrow(/not initialized.*initAppServices/s);
  });

  it('initializes through the injected factory and reports ready', async () => {
    const services = await makeInMemoryServices();
    configureAppServicesFactory(() => Promise.resolve(services));

    const result = await initAppServices();

    expect(result).toBe(services);
    expect(getServicesStatus()).toBe('ready');
    expect(tryGetAppServices()).toBe(services);
    expect(getAppServices()).toBe(services);
  });

  it('is idempotent — a second init returns the same graph', async () => {
    const services = await makeInMemoryServices();
    let buildCount = 0;
    configureAppServicesFactory(() => {
      buildCount += 1;
      return Promise.resolve(services);
    });

    const first = await initAppServices();
    const second = await initAppServices();

    expect(first).toBe(second);
    expect(buildCount).toBe(1);
  });

  it('records an error state and rethrows when the factory fails, then recovers', async () => {
    let shouldFail = true;
    configureAppServicesFactory(async () => {
      if (shouldFail) throw new Error('boom: database locked');
      return makeInMemoryServices();
    });

    await expect(initAppServices()).rejects.toThrow('boom: database locked');
    expect(getServicesStatus()).toBe('error');
    expect(tryGetAppServices()).toBeNull();
    expect(() => getAppServices()).toThrow(/not initialized.*status: error/s);

    shouldFail = false;
    const recovered = await initAppServices();
    expect(getServicesStatus()).toBe('ready');
    expect(recovered.database).toBeInstanceOf(InMemoryDatabase);
  });

  it('sync coordinator helpers no-op when services are not ready', async () => {
    await expect(startSyncCoordinator()).resolves.toBeUndefined();
    await expect(stopSyncCoordinator()).resolves.toBeUndefined();
  });

  it('setAppServicesForTesting publishes a graph without running the factory', () => {
    expect(tryGetAppServices()).toBeNull();

    const marker = { marker: true } as unknown as AppServices;
    setAppServicesForTesting(marker);
    expect(tryGetAppServices()).toBe(marker);
    expect(getServicesStatus()).toBe('ready');

    setAppServicesForTesting(null);
    expect(tryGetAppServices()).toBeNull();
    expect(getServicesStatus()).toBe('idle');
  });

  it('resetAppServices returns the registry to idle', async () => {
    const services = await makeInMemoryServices();
    configureAppServicesFactory(() => Promise.resolve(services));
    await initAppServices();
    expect(getServicesStatus()).toBe('ready');

    resetAppServices();
    expect(getServicesStatus()).toBe('idle');
    expect(tryGetAppServices()).toBeNull();
  });
});
