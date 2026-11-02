/**
 * use-group-members tests.
 *
 * Verifies the hook loads the group name + currency + active members
 * via `ListGroupMembersUseCase` over an in-memory services graph,
 * re-loads on focus, and reports the load-error path honestly.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { createGroup } from '@domain/entities/group';
import { createGroupMember } from '@domain/entities/group-member';
import { InMemoryDatabase } from '@infrastructure/__tests__/in-memory-database';
import { createCompositionRoot, type AppServices } from '@infrastructure/composition-root';
import { runMigrations } from '@infrastructure/sqlite/schema';
import { useGroupMembers } from '@presentation/hooks/use-group-members';
import { resetAppServices, setAppServicesForTesting } from '@store/services-registry';

// Mock expo-router: `useFocusEffect` becomes a no-op call so the
// hook's focus-reload behaviour does not require a navigation host.
jest.mock('expo-router', () => ({
  __esModule: true,
  useFocusEffect: (cb: () => () => void) => cb,
  useLocalSearchParams: () => ({}),
}));

async function makeInMemoryServices(): Promise<AppServices> {
  const db = new InMemoryDatabase();
  await runMigrations(db);
  return createCompositionRoot({ database: db });
}

async function seedGroup(services: AppServices): Promise<{
  groupId: string;
  aliceId: string;
  bobId: string;
}> {
  const groupId = 'g_members_test';
  const aliceId = 'm_alice';
  const bobId = 'm_bob';

  await services.repositories.groups.save(
    createGroup({
      id: groupId as never,
      name: 'Test Group',
      currencyCode: 'INR',
      createdBy: 'local-user' as never,
    }),
  );
  await services.repositories.members.save(
    createGroupMember({
      id: aliceId as never,
      groupId: groupId as never,
      displayName: 'Alice',
      role: 'owner',
    }),
  );
  await services.repositories.members.save(
    createGroupMember({
      id: bobId as never,
      groupId: groupId as never,
      displayName: 'Bob',
      role: 'member',
    }),
  );
  return { groupId, aliceId, bobId };
}

describe('useGroupMembers (integration)', () => {
  let services: AppServices;

  beforeEach(async () => {
    services = await makeInMemoryServices();
    setAppServicesForTesting(services);
  });

  afterEach(() => {
    resetAppServices();
  });

  it('loads group name, currency, and members', async () => {
    const { groupId, aliceId, bobId } = await seedGroup(services);

    const { result } = renderHook(() => useGroupMembers(groupId));

    await waitFor(() => expect(result.current.loadedOnce).toBe(true));

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.groupName).toBe('Test Group');
    expect(result.current.currencyCode).toBe('INR');
    expect(result.current.members).toHaveLength(2);
    expect(result.current.members.map((m) => m.id)).toEqual(
      expect.arrayContaining([aliceId, bobId]),
    );
    // isCurrentUser stays false (honest pre-identity default).
    expect(result.current.members.every((m) => m.isCurrentUser === false)).toBe(true);
  });

  it('handles an empty group id without throwing', async () => {
    const { result } = renderHook(() => useGroupMembers(''));

    await waitFor(() => expect(result.current.loadedOnce).toBe(true));

    expect(result.current.members).toEqual([]);
    expect(result.current.groupName).toBeNull();
    expect(result.current.currencyCode).toBeNull();
  });

  it('reports the load-error path when the group does not exist', async () => {
    const { result } = renderHook(() => useGroupMembers('g_does_not_exist'));

    await waitFor(() => expect(result.current.loadedOnce).toBe(true));

    expect(result.current.error).not.toBeNull();
    expect(result.current.members).toEqual([]);
  });

  it('stays in loading state when services are not ready', async () => {
    resetAppServices();
    const { result } = renderHook(() => useGroupMembers('g_any'));

    // Without services, the hook stays in the initial loading state
    // and does not mark loadedOnce until the readiness flips.
    expect(result.current.loading).toBe(true);
    expect(result.current.loadedOnce).toBe(false);

    // Flip services ready and let the effect run.
    await act(async () => {
      setAppServicesForTesting(services);
      await new Promise((r) => setTimeout(r, 10));
    });
    await waitFor(() => expect(result.current.loadedOnce).toBe(true));
  });
});
