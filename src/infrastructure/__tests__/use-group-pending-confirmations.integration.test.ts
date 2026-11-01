/**
 * use-group-pending-confirmations integration tests.
 *
 * Verifies the hook loads pending-confirmation settlements, resolves
 * names via the supplied nameById map, and that the confirm + dispute
 * callbacks actually call the matching use cases over the real SQLite
 * test double — moving the settlement out of `pending_confirmation`
 * status.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { createGroup } from '@domain/entities/group';
import { createGroupMember } from '@domain/entities/group-member';
import { InMemoryDatabase } from '@infrastructure/__tests__/in-memory-database';
import type { AppServices } from '@infrastructure/composition-root';
import { createCompositionRoot } from '@infrastructure/composition-root';
import { runMigrations } from '@infrastructure/sqlite/schema';
import { useGroupPendingConfirmations } from '@presentation/hooks/use-group-pending-confirmations';
import { resetAppServices, setAppServicesForTesting } from '@store/services-registry';

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

const GROUP_ID = 'g_pending_test';
const ALICE = 'm_pend_alice';
const BOB = 'm_pend_bob';
const USER = 'local-user';

async function seed(services: AppServices): Promise<{ settlementId: string }> {
  await services.repositories.groups.save(
    createGroup({
      id: GROUP_ID as never,
      name: 'Pending Test Group',
      currencyCode: 'USD',
      createdBy: USER as never,
    }),
  );
  await services.repositories.members.save(
    createGroupMember({
      id: ALICE as never,
      groupId: GROUP_ID as never,
      displayName: 'Alice',
      role: 'owner',
    }),
  );
  await services.repositories.members.save(
    createGroupMember({
      id: BOB as never,
      groupId: GROUP_ID as never,
      displayName: 'Bob',
      role: 'member',
    }),
  );

  // Create a settlement + record it so it's in pending_confirmation.
  const draft = await services.settlements.createSettlementDraft.execute({
    groupId: GROUP_ID,
    fromMemberId: BOB,
    toMemberId: ALICE,
    amountMinor: 2500,
    currencyCode: 'USD',
    method: 'upi',
    note: 'Dinner split',
    createdBy: USER as never,
    operationId: 'op-pending-1',
  });
  await services.settlements.recordSettlement.execute({
    settlementId: draft.settlementId,
    expectedVersion: 1,
    actorMemberId: BOB as never,
    note: 'UPI sent',
  });
  return { settlementId: draft.settlementId as string };
}

describe('useGroupPendingConfirmations (integration)', () => {
  let services: AppServices;

  beforeEach(async () => {
    services = await makeInMemoryServices();
    setAppServicesForTesting(services);
  });

  afterEach(() => {
    act(() => {
      resetAppServices();
    });
  });

  it('loads pending-confirmation settlements with names resolved', async () => {
    await seed(services);
    const nameById = new Map<string, string>([
      [ALICE, 'Alice'],
      [BOB, 'Bob'],
    ]);

    const { result } = renderHook(() => useGroupPendingConfirmations(GROUP_ID, nameById));

    await waitFor(() => expect(result.current.loadedOnce).toBe(true));

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]!.fromMemberName).toBe('Bob');
    expect(result.current.entries[0]!.toMemberName).toBe('Alice');
    expect(result.current.entries[0]!.amountMinor).toBe(2500);
    expect(result.current.entries[0]!.currencyCode).toBe('USD');
    expect(result.current.entries[0]!.method).toBe('UPI');
    expect(result.current.entries[0]!.note).toBe('Dinner split');
  });

  it('falls back to "Unknown member" when the nameById map is missing the member id', async () => {
    await seed(services);

    const { result } = renderHook(() => useGroupPendingConfirmations(GROUP_ID));

    await waitFor(() => expect(result.current.loadedOnce).toBe(true));

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]!.fromMemberName).toBe('Unknown member');
    expect(result.current.entries[0]!.toMemberName).toBe('Unknown member');
  });

  it('returns an empty list when the group has no pending confirmations', async () => {
    // Seed the group but don't record a settlement.
    await services.repositories.groups.save(
      createGroup({
        id: GROUP_ID as never,
        name: 'Empty Pending Group',
        currencyCode: 'USD',
        createdBy: USER as never,
      }),
    );

    const { result } = renderHook(() => useGroupPendingConfirmations(GROUP_ID));

    await waitFor(() => expect(result.current.loadedOnce).toBe(true));
    expect(result.current.entries).toEqual([]);
  });

  it('stays in loading state when services are not ready', async () => {
    resetAppServices();
    const { result } = renderHook(() => useGroupPendingConfirmations(GROUP_ID));

    expect(result.current.loading).toBe(true);
    expect(result.current.loadedOnce).toBe(false);
  });

  it('confirm() calls the use case and removes the settlement from the list', async () => {
    const { settlementId } = await seed(services);
    const nameById = new Map<string, string>([
      [ALICE, 'Alice'],
      [BOB, 'Bob'],
    ]);

    const { result } = renderHook(() => useGroupPendingConfirmations(GROUP_ID, nameById));
    await waitFor(() => expect(result.current.loadedOnce).toBe(true));
    expect(result.current.entries).toHaveLength(1);

    await act(async () => {
      await result.current.confirm(settlementId, 2, ALICE);
    });

    // The just-confirmed settlement should drop out of pending_confirmation.
    expect(result.current.entries).toHaveLength(0);
    expect(result.current.acting).toBe(false);

    // Verify it's persisted as `completed`.
    const persisted = await services.repositories.settlements.findById(settlementId as never);
    expect(persisted).not.toBeNull();
    expect(persisted!.status).toBe('completed');
  });

  it('dispute() calls the use case and removes the settlement from the list', async () => {
    const { settlementId } = await seed(services);
    const nameById = new Map<string, string>([
      [ALICE, 'Alice'],
      [BOB, 'Bob'],
    ]);

    const { result } = renderHook(() => useGroupPendingConfirmations(GROUP_ID, nameById));
    await waitFor(() => expect(result.current.loadedOnce).toBe(true));

    await act(async () => {
      await result.current.dispute(settlementId, 2, 'not_received', 'Did not receive');
    });

    expect(result.current.entries).toHaveLength(0);

    // Verify it's persisted as `disputed`.
    const persisted = await services.repositories.settlements.findById(settlementId as never);
    expect(persisted).not.toBeNull();
    expect(persisted!.status).toBe('disputed');
    expect(persisted!.disputeReason).toBe('not_received');
  });

  it('surfaces the action error when the confirm use case throws', async () => {
    await seed(services);
    const nameById = new Map<string, string>([
      [ALICE, 'Alice'],
      [BOB, 'Bob'],
    ]);

    const { result } = renderHook(() => useGroupPendingConfirmations(GROUP_ID, nameById));
    await waitFor(() => expect(result.current.loadedOnce).toBe(true));

    await act(async () => {
      // Wrong expectedVersion → version-conflict error.
      await expect(
        result.current.confirm('settle_does_not_exist', 999, ALICE),
      ).rejects.toThrow();
    });

    expect(result.current.actionError).not.toBeNull();
    expect(result.current.acting).toBe(false);
  });
});
