/**
 * use-home-dashboard-data integration tests.
 *
 * Verifies the hook aggregates real financial data across all groups
 * via the services registry: pending-confirmation settlements +
 * suggested-settlement counts per group. Lives under
 * `src/infrastructure/__tests__/` because the integration needs to
 * import `@infrastructure/*` (forbidden in `src/presentation/**`).
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { createGroup } from '@domain/entities/group';
import { createGroupMember } from '@domain/entities/group-member';
import { InMemoryDatabase } from '@infrastructure/__tests__/in-memory-database';
import type { AppServices } from '@infrastructure/composition-root';
import { createCompositionRoot } from '@infrastructure/composition-root';
import { runMigrations } from '@infrastructure/sqlite/schema';
import { useHomeDashboardData } from '@presentation/hooks/use-home-dashboard-data';
import { useGroupStore } from '@store/group-store';
import { resetAppServices, setAppServicesForTesting } from '@store/services-registry';

// Mock expo-router with SEMANTICS CLOSE TO THE REAL PACKAGE: the
// focus callback re-runs when its identity changes (as with a
// useCallback dep), instead of on every render — the naive mock
// fired load() on every render, masking stale-response races.
jest.mock('expo-router', () => ({
  __esModule: true,
  useFocusEffect: (cb: () => () => void): void => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
    const react = require('react') as {
      useEffect: (effect: () => () => void, deps: readonly unknown[]) => void;
    };
    react.useEffect(() => cb(), [cb]);
  },
  useLocalSearchParams: () => ({}),
}));

async function makeInMemoryServices(): Promise<AppServices> {
  const db = new InMemoryDatabase();
  await runMigrations(db);
  return createCompositionRoot({ database: db });
}

const GROUP_ID = 'g_dash_test';
const ALICE_ID = 'm_dash_alice';
const BOB_ID = 'm_dash_bob';
const CAROL_ID = 'm_dash_carol';

async function seedGroupWithPendingSettlement(
  services: AppServices,
): Promise<void> {
  await services.repositories.groups.save(
    createGroup({
      id: GROUP_ID as never,
      name: 'Dashboard Test Group',
      currencyCode: 'USD',
      createdBy: 'local-user' as never,
    }),
  );
  for (const [id, name] of [
    [ALICE_ID, 'Alice'],
    [BOB_ID, 'Bob'],
    [CAROL_ID, 'Carol'],
  ] as const) {
    await services.repositories.members.save(
      createGroupMember({
        id: id as never,
        groupId: GROUP_ID as never,
        displayName: name,
        role: id === ALICE_ID ? 'owner' : 'member',
      }),
    );
  }

  // Create an expense so the balance engine has a non-zero position
  // and suggests a settlement. Alice pays 1000 for a 3-way split.
  await services.expenses.createExpenseManually.execute({
    groupId: GROUP_ID,
    title: 'Dinner',
    amountMinor: 3000,
    currencyCode: 'USD',
    payerContributions: [{ memberId: ALICE_ID, amountMinor: 3000 }],
    participantIds: [ALICE_ID, BOB_ID, CAROL_ID],
    createdBy: 'local-user' as never,
  });

  // Create a draft settlement and record it so it lands in
  // `pending_confirmation` status (the dashboard's main signal).
  const draft = await services.settlements.createSettlementDraft.execute({
    groupId: GROUP_ID,
    fromMemberId: BOB_ID,
    toMemberId: ALICE_ID,
    amountMinor: 1000,
    currencyCode: 'USD',
    method: 'upi',
    note: 'Settling my share',
    createdBy: 'local-user' as never,
    operationId: 'op-dash-1',
  });
  await services.settlements.recordSettlement.execute({
    settlementId: draft.settlementId,
    expectedVersion: 1,
    actorMemberId: BOB_ID as never,
    note: 'Sent via UPI',
  });
}

describe('useHomeDashboardData (integration)', () => {
  let services: AppServices;

  beforeEach(async () => {
    services = await makeInMemoryServices();
    setAppServicesForTesting(services);
    useGroupStore.getState().reset();
  });

  afterEach(() => {
    act(() => {
      resetAppServices();
      useGroupStore.getState().reset();
    });
  });

  it('aggregates pending-confirmation count and outstanding-balances count', async () => {
    await seedGroupWithPendingSettlement(services);
    useGroupStore.getState().addGroup({
      id: GROUP_ID,
      name: 'Dashboard Test Group',
      currencyCode: 'USD',
      memberCount: 3,
      userBalanceMinor: 0,
      lastActivityLabel: 'Just now',
      archived: false,
      syncState: 'pending',
      groupType: 'General',
      privacyDefault: 'local_only',
      createdAt: '2026-10-01T09:00:00.000Z',
      updatedAt: '2026-10-09T09:00:00.000Z',
    });

    const { result } = renderHook(() => useHomeDashboardData());

    await waitFor(() => expect(result.current.loadedOnce).toBe(true));

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.pendingConfirmationCount).toBe(1);
    expect(result.current.pendingConfirmationGroups).toHaveLength(1);
    expect(result.current.pendingConfirmationGroups[0]!.groupId).toBe(GROUP_ID);
    expect(result.current.pendingConfirmationGroups[0]!.count).toBe(1);

    // Bob owes 1000 → suggested transfer exists.
    expect(result.current.suggestedTransferCount).toBeGreaterThanOrEqual(1);
    expect(result.current.outstandingBalancesGroups).toHaveLength(1);
    expect(result.current.firstPendingGroup).not.toBeNull();
    expect(result.current.firstPendingGroup!.groupId).toBe(GROUP_ID);
  });

  it('returns zero counts when the user has no groups', async () => {
    const { result } = renderHook(() => useHomeDashboardData());

    await waitFor(() => expect(result.current.loadedOnce).toBe(true));

    expect(result.current.pendingConfirmationCount).toBe(0);
    expect(result.current.suggestedTransferCount).toBe(0);
    expect(result.current.firstPendingGroup).toBeNull();
  });

  it('stays in loading state when services are not ready', async () => {
    resetAppServices();
    const { result } = renderHook(() => useHomeDashboardData());

    expect(result.current.loading).toBe(true);
    expect(result.current.loadedOnce).toBe(false);
  });

  it('handles a single group failing without aborting the whole load', async () => {
    // Persist a group whose id does NOT exist in the repository, and
    // force its suggestions + balance queries to REJECT (a missing
    // group alone returns empty results gracefully — a real partial
    // failure needs the query itself to throw, e.g. corrupted rows).
    useGroupStore.getState().addGroup({
      id: 'g_missing',
      name: 'Missing Group',
      currencyCode: 'USD',
      memberCount: 2,
      userBalanceMinor: 0,
      lastActivityLabel: 'Just now',
      archived: false,
      syncState: 'pending',
      groupType: 'General',
      privacyDefault: 'local_only',
      createdAt: '2026-10-01T09:00:00.000Z',
      updatedAt: '2026-10-09T09:00:00.000Z',
    });
    jest
      .spyOn(services.explanations.generateSettlementSuggestions, 'execute')
      .mockRejectedValue(new Error('suggestions query failed'));
    jest
      .spyOn(services.balances.getGroupBalances, 'execute')
      .mockRejectedValue(new Error('balance query failed'));

    const { result } = renderHook(() => useHomeDashboardData());

    await waitFor(() => expect(result.current.loadedOnce).toBe(true));
    expect(result.current.error).toBeNull();
    expect(result.current.pendingConfirmationCount).toBe(0);
    expect(result.current.suggestedTransferCount).toBe(0);

    // Phase 4 — the failure is NO LONGER SILENT: the group is flagged
    // degraded, and the balance query is flagged unavailable so
    // "all settled up" is never claimed on partial data.
    expect(result.current.degradedGroupIds).toContain('g_missing');
    expect(result.current.balancesUnavailableGroupIds).toContain('g_missing');
  });

  it('keeps healthy groups\u2019 data when another group partially fails', async () => {
    // Healthy group: seeded with 1 pending confirmation + suggestions.
    await seedGroupWithPendingSettlement(services);
    useGroupStore.getState().addGroup({
      id: GROUP_ID,
      name: 'Dashboard Test Group',
      currencyCode: 'USD',
      memberCount: 3,
      userBalanceMinor: 0,
      lastActivityLabel: 'Just now',
      archived: false,
      syncState: 'pending',
      groupType: 'General',
      privacyDefault: 'local_only',
      createdAt: '2026-10-01T09:00:00.000Z',
      updatedAt: '2026-10-09T09:00:00.000Z',
    });
    // Failing group: only its SUGGESTIONS query rejects (balance query
    // still healthy — so balances stay authoritative while counts are
    // partial).
    useGroupStore.getState().addGroup({
      id: 'g_flaky',
      name: 'Flaky Group',
      currencyCode: 'USD',
      memberCount: 2,
      userBalanceMinor: 0,
      lastActivityLabel: 'Just now',
      archived: false,
      syncState: 'pending',
      groupType: 'General',
      privacyDefault: 'local_only',
      createdAt: '2026-10-01T09:00:00.000Z',
      updatedAt: '2026-10-08T09:00:00.000Z',
    });
    const suggestionsUseCase = services.explanations.generateSettlementSuggestions;
    const realSuggestions = suggestionsUseCase.execute.bind(suggestionsUseCase);
    jest
      .spyOn(suggestionsUseCase, 'execute')
      .mockImplementation(async (input) => {
        if ((input.groupId as string) === 'g_flaky') {
          throw new Error('flaky group suggestions failed');
        }
        return realSuggestions(input);
      });

    const { result } = renderHook(() => useHomeDashboardData());

    await waitFor(() => expect(result.current.loadedOnce).toBe(true));

    // Healthy group data survives the partial failure.
    expect(result.current.pendingConfirmationCount).toBe(1);
    expect(result.current.pendingConfirmationGroups[0]!.groupId).toBe(GROUP_ID);
    // Only the flaky group is degraded; the healthy one is not. The
    // flaky group's balance side is ALSO degraded — its member-list
    // query throws for a group missing from the repository — so its
    // balances are correctly flagged unavailable.
    expect(result.current.degradedGroupIds).toEqual(['g_flaky']);
    expect(result.current.balancesUnavailableGroupIds).toEqual(['g_flaky']);
    expect(result.current.error).toBeNull();
  });

  it('reloads when services become ready after initial mount', async () => {
    resetAppServices();
    const { result } = renderHook(() => useHomeDashboardData());

    expect(result.current.loading).toBe(true);

    await act(async () => {
      setAppServicesForTesting(services);
      await new Promise((r) => setTimeout(r, 10));
    });

    await waitFor(() => expect(result.current.loadedOnce).toBe(true));
  });

  it('aggregates the current user net balance per currency across groups', async () => {
    // Create a group via CreateGroupUseCase — this sets the owner
    // member's userId to 'local-user' (the synthetic pre-identity id).
    await services.groups.createGroup.execute({
      groupId: GROUP_ID,
      name: 'Dashboard Test Group',
      currencyCode: 'USD',
      createdBy: 'local-user' as never,
      ownerMemberId: ALICE_ID,
    });
    // Add Bob + Carol as members (the owner is Alice, already created
    // by the use case above).
    for (const [id, name] of [
      [BOB_ID, 'Bob'],
      [CAROL_ID, 'Carol'],
    ] as const) {
      await services.repositories.members.save(
        createGroupMember({
          id: id as never,
          groupId: GROUP_ID as never,
          displayName: name,
          role: 'member',
        }),
      );
    }

    // Record an expense: Alice (owner, userId='local-user') pays 3000
    // for a 3-way split with Bob + Carol. Alice's net = +2000.
    await services.expenses.createExpenseManually.execute({
      groupId: GROUP_ID,
      title: 'Dinner',
      amountMinor: 3000,
      currencyCode: 'USD',
      payerContributions: [{ memberId: ALICE_ID, amountMinor: 3000 }],
      participantIds: [ALICE_ID, BOB_ID, CAROL_ID],
      createdBy: 'local-user' as never,
    });

    useGroupStore.getState().addGroup({
      id: GROUP_ID,
      name: 'Dashboard Test Group',
      currencyCode: 'USD',
      memberCount: 3,
      userBalanceMinor: 0,
      lastActivityLabel: 'Just now',
      archived: false,
      syncState: 'pending',
      groupType: 'General',
      privacyDefault: 'local_only',
      createdAt: '2026-10-01T09:00:00.000Z',
      updatedAt: '2026-10-09T09:00:00.000Z',
    });

    const { result } = renderHook(() => useHomeDashboardData());

    await waitFor(() => expect(result.current.loadedOnce).toBe(true));

    // The user (Alice) is owed 2000 minor units in USD — her paid (3000)
    // minus her share (1000). The balance engine's
    // `memberCurrencyBalances[].userId === 'local-user'` row carries
    // +2000; the dashboard sums it into `userBalances`.
    expect(result.current.userBalances).toEqual([
      { currencyCode: 'USD', amountMinor: 2000 },
    ]);
  });

  // -------------------------------------------------------------------------
  // Phase 4 — stale-response guard
  // -------------------------------------------------------------------------

  it('discards stale responses when a newer load supersedes an in-flight one', async () => {
    // One group; the FIRST listPendingConfirmations call hangs on a
    // deferred, the second (and later) calls pass through to the real
    // implementation.
    await seedGroupWithPendingSettlement(services);
    useGroupStore.getState().addGroup({
      id: GROUP_ID,
      name: 'Dashboard Test Group',
      currencyCode: 'USD',
      memberCount: 3,
      userBalanceMinor: 0,
      lastActivityLabel: 'Just now',
      archived: false,
      syncState: 'pending',
      groupType: 'General',
      privacyDefault: 'local_only',
      createdAt: '2026-10-01T09:00:00.000Z',
      updatedAt: '2026-10-09T09:00:00.000Z',
    });

    const pendingUseCase = services.settlements.listPendingConfirmations;
    const realPending = pendingUseCase.execute.bind(pendingUseCase);
    let firstCall = true;
    let releaseFirst: (value: { items: unknown[]; hasMore: boolean }) => void = () => {};
    const firstCallGate = new Promise<{ items: unknown[]; hasMore: boolean }>((resolve) => {
      releaseFirst = resolve;
    });
    jest.spyOn(pendingUseCase, 'execute').mockImplementation(async (input) => {
      if (firstCall) {
        firstCall = false;
        // Load 1 sees the OLD world: 1 pending confirmation.
        return firstCallGate as never;
      }
      return realPending(input);
    });

    const { result } = renderHook(() => useHomeDashboardData());

    // Load 1 is in flight (hanging on the gate). Change the groups
    // array identity → `load` is recreated → a NEW load starts and
    // completes with the same seeded data (1 pending confirmation).
    await act(async () => {
      useGroupStore.getState().upsertGroup({
        id: GROUP_ID,
        name: 'Dashboard Test Group',
        currencyCode: 'USD',
        memberCount: 3,
        userBalanceMinor: 0,
        lastActivityLabel: 'Just now',
        archived: false,
        syncState: 'pending',
        groupType: 'General',
        privacyDefault: 'local_only',
        createdAt: '2026-10-01T09:00:00.000Z',
        updatedAt: '2026-10-10T09:00:00.000Z',
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.pendingConfirmationCount).toBe(1);

    // Now release the STALE load-1 response with DIFFERENT (outdated)
    // data — a zero-count payload predating the seed. Without the
    // epoch guard this would clobber the fresh state.
    await act(async () => {
      releaseFirst({ items: [], hasMore: false });
      await Promise.resolve();
    });

    // The stale response was discarded — fresh data remains.
    expect(result.current.pendingConfirmationCount).toBe(1);
    expect(result.current.pendingConfirmationGroups[0]!.groupId).toBe(GROUP_ID);
  });

  // -------------------------------------------------------------------------
  // Phase 4 — retry (offline → recovery)
  // -------------------------------------------------------------------------

  it('retry() recovers after a total load failure (offline → back online)', async () => {
    await seedGroupWithPendingSettlement(services);
    useGroupStore.getState().addGroup({
      id: GROUP_ID,
      name: 'Dashboard Test Group',
      currencyCode: 'USD',
      memberCount: 3,
      userBalanceMinor: 0,
      lastActivityLabel: 'Just now',
      archived: false,
      syncState: 'pending',
      groupType: 'General',
      privacyDefault: 'local_only',
      createdAt: '2026-10-01T09:00:00.000Z',
      updatedAt: '2026-10-09T09:00:00.000Z',
    });

    // Simulate offline: the pending-confirmations query rejects on
    // EVERY call while the offline flag is set (both mount loads fail
    // for this group — it is not a one-shot glitch).
    const pendingUseCase = services.settlements.listPendingConfirmations;
    const realPending = pendingUseCase.execute.bind(pendingUseCase);
    let offline = true;
    jest.spyOn(pendingUseCase, 'execute').mockImplementation(async (input) => {
      if (offline) {
        throw new Error('database is locked (offline glitch)');
      }
      return realPending(input);
    });

    const { result } = renderHook(() => useHomeDashboardData());

    // The initial loads record the group as degraded (query failed).
    await waitFor(() => expect(result.current.loadedOnce).toBe(true));
    expect(result.current.degradedGroupIds).toContain(GROUP_ID);

    // Connectivity restored + user taps "Try again" → recovery.
    offline = false;
    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.degradedGroupIds).toEqual([]);
    expect(result.current.pendingConfirmationCount).toBe(1);
    expect(result.current.pendingConfirmationGroups[0]!.groupId).toBe(GROUP_ID);
  });
});
