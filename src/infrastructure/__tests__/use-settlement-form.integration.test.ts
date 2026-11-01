/**
 * use-settlement-form tests.
 *
 * Verifies the hook's orchestration of the two-step
 * create-draft → record-payment flow over an in-memory services graph,
 * plus the amount-parsing helper and the idempotency contract.
 *
 * The in-memory graph is built over the same InMemoryDatabase used
 * by the composition-root tests; the settlement write-side adapter
 * is real (the SQLite test double), so the test exercises the actual
 * SQL the production adapter issues.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { createExpense } from '@domain/entities/expense';
import { createExpensePayer } from '@domain/entities/expense-payer';
import { createExpenseSplit } from '@domain/entities/expense-split';
import { createGroup } from '@domain/entities/group';
import { createGroupMember } from '@domain/entities/group-member';
import { InMemoryDatabase } from '@infrastructure/__tests__/in-memory-database';
import { createCompositionRoot, type AppServices } from '@infrastructure/composition-root';
import { runMigrations } from '@infrastructure/sqlite/schema';
import {
  parseAmountToMinor,
  SettlementOverpaymentError,
  useSettlementForm,
} from '@presentation/hooks/use-settlement-form';
import { resetAppServices, setAppServicesForTesting } from '@store/services-registry';

// expo-router is mocked away so the hook does not touch navigation.
jest.mock('expo-router', () => ({
  __esModule: true,
  useFocusEffect: (cb: () => () => void) => cb,
  useLocalSearchParams: () => ({}),
}));

// ---------------------------------------------------------------------------
// Test graph
// ---------------------------------------------------------------------------

async function makeInMemoryServices(): Promise<AppServices> {
  const db = new InMemoryDatabase();
  await runMigrations(db);
  return createCompositionRoot({ database: db });
}

async function seedGroupAndMembers(services: AppServices): Promise<{
  groupId: string;
  aliceId: string;
  bobId: string;
}> {
  const groupId = 'g_test_group';
  const aliceId = 'm_alice';
  const bobId = 'm_bob';

  await services.repositories.groups.save(
    createGroup({
      id: groupId as never,
      name: 'Test Group',
      currencyCode: 'USD',
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

// ---------------------------------------------------------------------------
// parseAmountToMinor
// ---------------------------------------------------------------------------

describe('parseAmountToMinor', () => {
  it('parses 2-decimal currencies correctly', () => {
    expect(parseAmountToMinor('42.50', 'USD')).toBe(4250);
    expect(parseAmountToMinor('100', 'USD')).toBe(10000);
    expect(parseAmountToMinor('0.99', 'USD')).toBe(99);
  });

  it('parses 0-decimal currencies (JPY)', () => {
    expect(parseAmountToMinor('1500', 'JPY')).toBe(1500);
  });

  it('parses 3-decimal currencies (KWD)', () => {
    expect(parseAmountToMinor('1.234', 'KWD')).toBe(1234);
  });

  it('returns NaN for invalid input', () => {
    expect(parseAmountToMinor('', 'USD')).toBeNaN();
    expect(parseAmountToMinor('abc', 'USD')).toBeNaN();
    expect(parseAmountToMinor('-5', 'USD')).toBeNaN();
    expect(parseAmountToMinor('5.123', 'USD')).toBeNaN(); // too many decimals for USD
  });
});

// ---------------------------------------------------------------------------
// useSettlementForm integration
// ---------------------------------------------------------------------------

describe('useSettlementForm (integration)', () => {
  let services: AppServices;

  beforeEach(async () => {
    services = await makeInMemoryServices();
    setAppServicesForTesting(services);
  });

  afterEach(() => {
    resetAppServices();
  });

  it('creates a draft + records a pending_confirmation settlement', async () => {
    const { groupId, aliceId, bobId } = await seedGroupAndMembers(services);

    const { result } = renderHook(() => useSettlementForm());

    expect(result.current.submitting).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.operationId).toMatch(/^[0-9a-f-]{20,}$/);

    let outcome;
    await act(async () => {
      outcome = await result.current.submit({
        groupId,
        fromMemberId: aliceId,
        toMemberId: bobId,
        amountMajor: '50.00',
        currencyCode: 'USD',
        method: 'upi',
        note: 'Dinner split',
        createdBy: 'local-user',
        actorMemberId: aliceId,
      });
    });

    expect(outcome).toBeDefined();
    expect(outcome!.settlementId.length).toBeGreaterThan(0);
    expect(outcome!.status).toBe('pending_confirmation');
    expect(outcome!.created).toBe(true);
    expect(result.current.submitting).toBe(false);

    // Verify the settlement was actually persisted via the repository.
    const persisted = await services.repositories.settlements.findById(
      outcome!.settlementId as never,
    );
    expect(persisted).not.toBeNull();
    expect(persisted!.amountMinor).toBe(5000);
    expect(persisted!.status).toBe('pending_confirmation');
    expect(persisted!.fromMemberId).toBe(aliceId);
    expect(persisted!.toMemberId).toBe(bobId);
  });

  it('rejects same from/to member before calling the use cases', async () => {
    const { groupId, aliceId } = await seedGroupAndMembers(services);
    const { result } = renderHook(() => useSettlementForm());

    await act(async () => {
      await expect(
        result.current.submit({
          groupId,
          fromMemberId: aliceId,
          toMemberId: aliceId,
          amountMajor: '10.00',
          currencyCode: 'USD',
          method: 'cash',
          note: '',
          createdBy: 'local-user',
        }),
      ).rejects.toThrow('Payer and receiver');
    });
    expect(result.current.error).toContain('Payer and receiver');
  });

  it('rejects non-positive amounts before calling the use cases', async () => {
    const { groupId, aliceId, bobId } = await seedGroupAndMembers(services);
    const { result } = renderHook(() => useSettlementForm());

    await act(async () => {
      await expect(
        result.current.submit({
          groupId,
          fromMemberId: aliceId,
          toMemberId: bobId,
          amountMajor: '0',
          currencyCode: 'USD',
          method: 'cash',
          note: '',
          createdBy: 'local-user',
        }),
      ).rejects.toThrow('positive amount');
    });
  });

  it('reports when services are not ready', async () => {
    resetAppServices();
    const { result } = renderHook(() => useSettlementForm());

    await act(async () => {
      await expect(
        result.current.submit({
          groupId: 'g_x',
          fromMemberId: 'a',
          toMemberId: 'b',
          amountMajor: '10.00',
          currencyCode: 'USD',
          method: 'cash',
          note: '',
          createdBy: 'local-user',
        }),
      ).rejects.toThrow('Storage is not ready');
    });
    expect(result.current.error).toContain('Storage is not ready');
  });

  it('reset clears the error and rotates the operationId', async () => {
    const { result } = renderHook(() => useSettlementForm());
    const firstOpId = result.current.operationId;

    // Inject an error via a failing submit (zero amount).
    await act(async () => {
      await expect(
        result.current.submit({
          groupId: '',
          fromMemberId: 'a',
          toMemberId: 'b',
          amountMajor: '0',
          currencyCode: 'USD',
          method: 'cash',
          note: '',
          createdBy: 'local-user',
        }),
      ).rejects.toThrow('positive amount');
    });

    expect(result.current.error).toContain('positive amount');

    act(() => {
      result.current.reset();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.submitting).toBe(false);
    expect(result.current.operationId).not.toBe(firstOpId);
  });
});

// ---------------------------------------------------------------------------
// Overpayment guard (Phase 3 — financial correctness)
// ---------------------------------------------------------------------------

/**
 * Seed a 50/50 expense: Alice paid USD 50.00 (5000 minor), split
 * equally with Bob. Resulting nets: Alice +2500 (owed), Bob -2500
 * (owes) — the canonical one-expense balance fixture.
 */
async function seedFiftyFiftyExpense(
  services: AppServices,
  ctx: { groupId: string; aliceId: string; bobId: string },
): Promise<void> {
  const expense = createExpense({
    id: 'e_seed_1' as never,
    groupId: ctx.groupId as never,
    title: 'Seeded dinner',
    amountMinor: 5000,
    currencyCode: 'USD',
    expenseDate: '2026-01-15T10:00:00.000Z',
    splitType: 'equal',
    createdBy: 'local-user' as never,
    now: '2026-01-15T10:00:00.000Z' as never,
  });
  const payers = [
    createExpensePayer({
      id: 'ep_seed_1' as never,
      expenseId: expense.id,
      memberId: ctx.aliceId as never,
      amountMinor: 5000,
      now: '2026-01-15T10:00:00.000Z' as never,
    }),
  ];
  const splits = [
    createExpenseSplit({
      id: 'es_seed_1' as never,
      expenseId: expense.id,
      memberId: ctx.aliceId as never,
      amountMinor: 2500,
      now: '2026-01-15T10:00:00.000Z' as never,
    }),
    createExpenseSplit({
      id: 'es_seed_2' as never,
      expenseId: expense.id,
      memberId: ctx.bobId as never,
      amountMinor: 2500,
      now: '2026-01-15T10:00:00.000Z' as never,
    }),
  ];
  await services.repositories.expenses.save(expense, payers, splits);
}

describe('useSettlementForm — overpayment guard (integration)', () => {
  let services: AppServices;

  beforeEach(async () => {
    services = await makeInMemoryServices();
    setAppServicesForTesting(services);
  });

  afterEach(() => {
    resetAppServices();
  });

  it('blocks an amount exceeding the payer debt and persists NOTHING', async () => {
    const { groupId, aliceId, bobId } = await seedGroupAndMembers(services);
    await seedFiftyFiftyExpense(services, { groupId, aliceId, bobId });

    const { result } = renderHook(() => useSettlementForm());

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.submit({
          groupId,
          fromMemberId: bobId, // Bob owes 2500
          toMemberId: aliceId,
          amountMajor: '30.00', // 3000 > 2500 → overpayment
          currencyCode: 'USD',
          method: 'cash',
          note: '',
          createdBy: 'local-user',
        });
      } catch (err) {
        caught = err;
      }
    });

    // Typed error with the warning payload.
    expect(caught).toBeInstanceOf(SettlementOverpaymentError);
    const warning = result.current.overpayment;
    expect(warning).not.toBeNull();
    expect(warning!.reason).toBe('exceeds_outstanding');
    expect(warning!.amountMinor).toBe(3000);
    expect(warning!.outstandingMinor).toBe(2500);
    expect(warning!.payerNetMinor).toBe(-2500);

    // Guard fired BEFORE any write — no draft, no settlement.
    const existing = await services.repositories.settlements.findByOperationId(
      result.current.operationId as never,
    );
    expect(existing).toBeNull();

    // Not an error banner — it is a confirmation request.
    expect(result.current.error).toBeNull();
    expect(result.current.submitting).toBe(false);
  });

  it('records anyway after explicit confirmOverpayment, clearing the warning', async () => {
    const { groupId, aliceId, bobId } = await seedGroupAndMembers(services);
    await seedFiftyFiftyExpense(services, { groupId, aliceId, bobId });

    const { result } = renderHook(() => useSettlementForm());

    // First submit → blocked.
    await act(async () => {
      await expect(
        result.current.submit({
          groupId,
          fromMemberId: bobId,
          toMemberId: aliceId,
          amountMajor: '30.00',
          currencyCode: 'USD',
          method: 'cash',
          note: '',
          createdBy: 'local-user',
        }),
      ).rejects.toBeInstanceOf(SettlementOverpaymentError);
    });
    expect(result.current.overpayment).not.toBeNull();

    // Second submit with the explicit confirmation → recorded.
    let outcome;
    await act(async () => {
      outcome = await result.current.submit({
        groupId,
        fromMemberId: bobId,
        toMemberId: aliceId,
        amountMajor: '30.00',
        currencyCode: 'USD',
        method: 'cash',
        note: '',
        createdBy: 'local-user',
        confirmOverpayment: true,
      });
    });

    expect(outcome!.status).toBe('pending_confirmation');
    expect(result.current.overpayment).toBeNull();

    const persisted = await services.repositories.settlements.findById(
      outcome!.settlementId as never,
    );
    expect(persisted).not.toBeNull();
    expect(persisted!.amountMinor).toBe(3000);
  });

  it('records exactly the outstanding debt with no warning', async () => {
    const { groupId, aliceId, bobId } = await seedGroupAndMembers(services);
    await seedFiftyFiftyExpense(services, { groupId, aliceId, bobId });

    const { result } = renderHook(() => useSettlementForm());

    let outcome;
    await act(async () => {
      outcome = await result.current.submit({
        groupId,
        fromMemberId: bobId, // owes exactly 2500
        toMemberId: aliceId,
        amountMajor: '25.00', // == outstanding → fine
        currencyCode: 'USD',
        method: 'cash',
        note: '',
        createdBy: 'local-user',
      });
    });

    expect(outcome!.status).toBe('pending_confirmation');
    expect(result.current.overpayment).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('warns when the payer is a creditor (payer_is_owed)', async () => {
    const { groupId, aliceId, bobId } = await seedGroupAndMembers(services);
    await seedFiftyFiftyExpense(services, { groupId, aliceId, bobId });

    const { result } = renderHook(() => useSettlementForm());

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.submit({
          groupId,
          fromMemberId: aliceId, // Alice is OWED 2500 (creditor)
          toMemberId: bobId,
          amountMajor: '10.00',
          currencyCode: 'USD',
          method: 'cash',
          note: '',
          createdBy: 'local-user',
        });
      } catch (err) {
        caught = err;
      }
    });

    expect(caught).toBeInstanceOf(SettlementOverpaymentError);
    expect(result.current.overpayment?.reason).toBe('payer_is_owed');
    expect(result.current.overpayment?.payerNetMinor).toBe(2500);

    // No settlement created by the blocked attempt.
    const existing = await services.repositories.settlements.findByOperationId(
      result.current.operationId as never,
    );
    expect(existing).toBeNull();
  });

  it('never blocks when the preview itself fails (best-effort guard)', async () => {
    const { groupId, aliceId, bobId } = await seedGroupAndMembers(services);
    await seedFiftyFiftyExpense(services, { groupId, aliceId, bobId });

    // Simulate a broken/unavailable preview (e.g. balance query failure).
    const spy = jest
      .spyOn(services.explanations.previewSettlementImpact, 'execute')
      .mockRejectedValue(new Error('balance query unavailable'));

    const { result } = renderHook(() => useSettlementForm());

    let outcome;
    await act(async () => {
      outcome = await result.current.submit({
        groupId,
        fromMemberId: bobId,
        toMemberId: aliceId,
        amountMajor: '30.00', // would overpay — but the guard is unavailable
        currencyCode: 'USD',
        method: 'cash',
        note: '',
        createdBy: 'local-user',
      });
    });

    expect(outcome!.status).toBe('pending_confirmation');
    expect(result.current.overpayment).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('dismissOverpayment clears a pending warning without submitting', async () => {
    const { groupId, aliceId, bobId } = await seedGroupAndMembers(services);
    await seedFiftyFiftyExpense(services, { groupId, aliceId, bobId });

    const { result } = renderHook(() => useSettlementForm());

    await act(async () => {
      await expect(
        result.current.submit({
          groupId,
          fromMemberId: bobId,
          toMemberId: aliceId,
          amountMajor: '30.00',
          currencyCode: 'USD',
          method: 'cash',
          note: '',
          createdBy: 'local-user',
        }),
      ).rejects.toBeInstanceOf(SettlementOverpaymentError);
    });
    expect(result.current.overpayment).not.toBeNull();

    act(() => {
      result.current.dismissOverpayment();
    });
    expect(result.current.overpayment).toBeNull();
  });
});
