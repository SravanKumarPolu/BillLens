import { beforeEach, describe, expect, it } from '@jest/globals';

import type { RemoteSyncPort, ConnectivityPort } from '@application/sync/sync-coordinator-types';
import { createExpense } from '@domain/entities/expense';
import { createExpensePayer } from '@domain/entities/expense-payer';
import { createExpenseSplit } from '@domain/entities/expense-split';
import { createGroup } from '@domain/entities/group';
import { createGroupMember } from '@domain/entities/group-member';
import type { CaptureProcessor } from '@domain/ports/capture-processor.port';
import type { SecureStorage } from '@domain/ports/secure-storage.port';
import { SECURE_STORAGE_KEYS } from '@domain/ports/secure-storage.port';

import { createCompositionRoot, type AppServices } from '../composition-root';
import { runMigrations } from '../sqlite/schema';

import { InMemoryDatabase } from './in-memory-database';

/**
 * Composition root tests — prove the DI wiring is CORRECT, not just
 * present. The graph is built over the in-memory database + in-memory
 * ports (the same doubles used across the suite), seeded with a small
 * but real financial dataset, and the resolved use cases are executed.
 *
 * This is the executable evidence for Known Limitation #1 ("DI
 * composition root not yet wired"): after this suite, the root IS
 * wired and behaves identically to the production graph — only the
 * driver (expo-sqlite vs in-memory) differs.
 */

// ---------------------------------------------------------------------------
// Test doubles for the non-database ports.
// ---------------------------------------------------------------------------

class StubConnectivity implements ConnectivityPort {
  online = true;
  async isOnline(): Promise<boolean> {
    return this.online;
  }
  onConnectivityChange(): () => void {
    return () => undefined;
  }
}

class StubRemoteSync implements RemoteSyncPort {
  async uploadOperation(): Promise<{ status: 'success' }> {
    return { status: 'success' };
  }
}

class StubCaptureProcessor implements CaptureProcessor {
  async process(): Promise<never> {
    throw new Error('StubCaptureProcessor is not intended to process captures.');
  }
}

class StubSecureStorage implements SecureStorage {
  private readonly map = new Map<string, string>();
  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
  async get(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }
  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
  async has(key: string): Promise<boolean> {
    return this.map.has(key);
  }
}

// ---------------------------------------------------------------------------
// Seeding helpers — per-table inserts shaped exactly like the production
// sqlite schema (see src/infrastructure/sqlite/schema.ts).
// ---------------------------------------------------------------------------

const GROUP_ID = 'g-11111111-1111-4111-8111-111111111111';
const ALICE = 'm-aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const BOB = 'm-bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb';
const EXPENSE_ID = 'e-22222222-1111-4111-8111-222222222222';
const NOW = '2026-10-01T10:00:00.000Z';

async function seedGroupMembers(db: InMemoryDatabase): Promise<void> {
  await db.run(
    `insert into group_members (id, group_id, user_id, display_name, role, joined_at, updated_at, left_at, version)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ALICE, GROUP_ID, 'user-alice', 'Alice', 'owner', NOW, NOW, null, 1],
  );
  await db.run(
    `insert into group_members (id, group_id, user_id, display_name, role, joined_at, updated_at, left_at, version)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [BOB, GROUP_ID, null, 'Bob', 'member', NOW, NOW, null, 1],
  );
}

async function seedExpenseWithEqualSplit(db: InMemoryDatabase): Promise<void> {
  await db.run(
    `insert into expenses (id, group_id, title, amount_minor, currency_code, expense_date,
       split_type, created_by, created_at, updated_at, deleted_at, version)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [EXPENSE_ID, GROUP_ID, 'Dinner', 1000, 'INR', '2026-10-01', 'equal', ALICE, NOW, NOW, null, 1],
  );
  await db.run(
    `insert into expense_payers (id, expense_id, member_id, amount_minor, created_at, updated_at, deleted_at, version)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['p-1', EXPENSE_ID, ALICE, 1000, NOW, NOW, null, 1],
  );
  await db.run(
    `insert into expense_splits (id, expense_id, member_id, amount_minor, created_at, updated_at, deleted_at, version)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['s-1', EXPENSE_ID, ALICE, 500, NOW, NOW, null, 1],
  );
  await db.run(
    `insert into expense_splits (id, expense_id, member_id, amount_minor, created_at, updated_at, deleted_at, version)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['s-2', EXPENSE_ID, BOB, 500, NOW, NOW, null, 1],
  );
}

/** Seed one group, two members, one 10.00 INR expense paid by Alice, split equally. */
async function seedBalances(db: InMemoryDatabase): Promise<void> {
  await seedGroupMembers(db);
  await seedExpenseWithEqualSplit(db);
}

function buildServices(db: InMemoryDatabase, overrides?: { secureStorage?: SecureStorage }): AppServices {
  return createCompositionRoot({
    database: db,
    connectivity: new StubConnectivity(),
    remoteSync: new StubRemoteSync(),
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// The suite
// ---------------------------------------------------------------------------

describe('composition root', () => {
  let db: InMemoryDatabase;

  beforeEach(async () => {
    db = new InMemoryDatabase();
    await runMigrations(db);
  });

  it('builds the full service graph with default adapters', () => {
    const services = buildServices(db);

    expect(services.database).toBe(db);
    expect(typeof services.balances.getGroupBalances.execute).toBe('function');
    expect(typeof services.balances.getMemberBalance.execute).toBe('function');
    expect(typeof services.balances.getBalanceBreakdown.execute).toBe('function');
    expect(typeof services.balances.getGroupCurrencySummaries.execute).toBe('function');
    expect(typeof services.balances.getUnsettledMembers.execute).toBe('function');
    expect(typeof services.balances.recalculateGroupBalances.execute).toBe('function');
    expect(typeof services.balances.validateBalanceInvariants.execute).toBe('function');
    expect(typeof services.explanations.generateSettlementSuggestions.execute).toBe('function');
    expect(typeof services.explanations.explainMemberDebt.execute).toBe('function');
    expect(typeof services.explanations.explainMemberCredit.execute).toBe('function');
    expect(typeof services.explanations.getSuggestedTransferExplanation.execute).toBe('function');
    expect(typeof services.explanations.previewSettlementImpact.execute).toBe('function');
    expect(typeof services.explanations.compareOriginalAndSimplifiedPlan.execute).toBe('function');
    expect(typeof services.sync.coordinator.requestSync).toBe('function');
    expect(services.capture.processor).toBeInstanceOf(Object);
    expect(services.session).toBeNull();
  });

  it('wires the session bucket when a secure storage is provided', async () => {
    const secureStorage = new StubSecureStorage();
    const services = buildServices(db, { secureStorage });

    expect(services.session).not.toBeNull();
    const session = services.session!;

    await session.sessionStorage.saveSession({
      userId: 'u-1',
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: 0,
    } as never);
    expect(await secureStorage.get(SECURE_STORAGE_KEYS.supabaseAccessToken)).toBe('at');
    const restored = await session.sessionStorage.loadSession();
    expect(restored?.accessToken).toBe('at');
  });

  it('executes GetGroupBalancesUseCase end-to-end over seeded financial data', async () => {
    await seedBalances(db);
    const services = buildServices(db);

    const result = await services.balances.getGroupBalances.execute({
      groupId: GROUP_ID as never,
    });

    expect(result.notFound).toBe(false);
    expect(result.results).toHaveLength(1);
    const inr = result.results[0];
    expect(inr?.currencyCode).toBe('INR');
    const alice = inr?.memberCurrencyBalances.find((m) => m.memberId === ALICE);
    const bob = inr?.memberCurrencyBalances.find((m) => m.memberId === BOB);
    expect(alice?.netBalanceMinor).toBe(500);
    expect(bob?.netBalanceMinor).toBe(-500);
  });

  it('executes GetMemberBalanceUseCase through the composed graph', async () => {
    await seedBalances(db);
    const services = buildServices(db);

    const result = await services.balances.getMemberBalance.execute({
      groupId: GROUP_ID as never,
      memberId: BOB as never,
    });

    expect(result.notFound).toBe(false);
    const bobBalance = result.balances.find((b) => b.memberId === BOB);
    expect(bobBalance?.netBalanceMinor).toBe(-500);
  });

  it('reports notFound for an unknown group through the same graph', async () => {
    const services = buildServices(db);

    const result = await services.balances.getGroupBalances.execute({
      groupId: 'g-does-not-exist' as never,
    });
    expect(result.notFound).toBe(true);
    expect(result.results).toHaveLength(0);
  });

  it('produces a settlement suggestion from the seeded balances (explanations bucket)', async () => {
    await seedBalances(db);
    const services = buildServices(db);

    const output = await services.explanations.generateSettlementSuggestions.execute({
      groupId: GROUP_ID as never,
    });

    expect(output.notFound).toBe(false);
    expect(output.suggestions).toHaveLength(1);
    const inr = output.suggestions[0];
    expect(inr?.currencyCode).toBe('INR');
    expect(inr?.transferCount).toBe(1);
    expect(inr?.totalTransferredMinor).toBe(500);
    expect(inr?.transfers[0]?.fromMemberId).toBe(BOB);
    expect(inr?.transfers[0]?.toMemberId).toBe(ALICE);
  });

  it('validates balance invariants green on the seeded data', async () => {
    await seedBalances(db);
    const services = buildServices(db);

    const check = await services.balances.validateBalanceInvariants.execute({
      groupId: GROUP_ID as never,
    });

    expect(check.notFound).toBe(false);
    expect(check.failures).toHaveLength(0);
  });

  it('honours capture-processor overrides', () => {
    const processor = new StubCaptureProcessor();
    const services = createCompositionRoot({
      database: db,
      connectivity: new StubConnectivity(),
      remoteSync: new StubRemoteSync(),
      captureProcessor: processor,
    });
    expect(services.capture.processor).toBe(processor);
  });

  it('exposes the write-side repositories bucket', () => {
    const services = buildServices(db);
    expect(services.repositories.groups).toBeInstanceOf(Object);
    expect(services.repositories.members).toBeInstanceOf(Object);
    expect(services.repositories.expenses).toBeInstanceOf(Object);
    expect(services.repositories.drafts).toBeInstanceOf(Object);
  });

  it('persists group + members + expense through the repositories and reads REAL balances', async () => {
    // The write→read coherence proof: data written through the v2.0.3
    // repository adapters is immediately visible to the Phase 6 balance
    // engine — same tables, same column conventions, zero glue.
    const services = buildServices(db);
    const repo = services.repositories;

    await repo.groups.save(
      createGroup({
        id: GROUP_ID as never,
        name: 'Goa Trip',
        currencyCode: 'INR',
        createdBy: 'user-alice' as never,
        now: NOW as never,
      }),
    );
    await repo.members.save(
      createGroupMember({
        id: ALICE as never,
        groupId: GROUP_ID as never,
        userId: 'user-alice' as never,
        displayName: 'Alice',
        role: 'owner',
        now: NOW as never,
      }),
    );
    await repo.members.save(
      createGroupMember({
        id: BOB as never,
        groupId: GROUP_ID as never,
        displayName: 'Bob',
        role: 'member',
        now: NOW as never,
      }),
    );
    const expense = createExpense({
      id: EXPENSE_ID as never,
      groupId: GROUP_ID as never,
      title: 'Dinner',
      amountMinor: 1000,
      currencyCode: 'INR',
      expenseDate: '2026-10-01T18:30:00.000Z',
      splitType: 'equal',
      createdBy: 'user-alice' as never,
      now: NOW as never,
    });
    await repo.expenses.save(
      expense,
      [
        createExpensePayer({
          id: 'p-wire-1' as never,
          expenseId: expense.id,
          memberId: ALICE as never,
          amountMinor: 1000,
          now: NOW as never,
        }),
      ],
      [
        createExpenseSplit({
          id: 's-wire-1' as never,
          expenseId: expense.id,
          memberId: ALICE as never,
          amountMinor: 500,
          now: NOW as never,
        }),
        createExpenseSplit({
          id: 's-wire-2' as never,
          expenseId: expense.id,
          memberId: BOB as never,
          amountMinor: 500,
          now: NOW as never,
        }),
      ],
    );

    // The SAME graph's read side now reports real numbers.
    const result = await services.balances.getGroupBalances.execute({
      groupId: GROUP_ID as never,
    });
    expect(result.notFound).toBe(false);
    expect(result.results).toHaveLength(1);
    const inr = result.results[0];
    const alice = inr?.memberCurrencyBalances.find((m) => m.memberId === ALICE);
    const bob = inr?.memberCurrencyBalances.find((m) => m.memberId === BOB);
    expect(alice?.netBalanceMinor).toBe(500);
    expect(bob?.netBalanceMinor).toBe(-500);

    // Each write co-enqueued its offline-sync operation atomically.
    const ops = await db.all<Record<string, unknown>>(
      `select entity_type, operation from sync_operations order by created_at asc`,
    );
    expect(ops.map((o) => `${String(o['entity_type'])}:${String(o['operation'])}`)).toEqual([
      'group:create',
      'group_member:create',
      'group_member:create',
      'expense:create',
    ]);
  });

  it('builds independent graphs per call (no shared use-case state)', async () => {
    await seedBalances(db);
    const a = buildServices(db);
    const b = buildServices(db);
    expect(a.balances.getGroupBalances).not.toBe(b.balances.getGroupBalances);

    // Both graphs read the same underlying data identically.
    const ra = await a.balances.getGroupBalances.execute({ groupId: GROUP_ID as never });
    const rb = await b.balances.getGroupBalances.execute({ groupId: GROUP_ID as never });
    expect(ra.results[0]?.memberCurrencyBalances[0]?.netBalanceMinor).toBe(
      rb.results[0]?.memberCurrencyBalances[0]?.netBalanceMinor,
    );
  });

  it('wires the identity bucket when secure storage is provided (v2.4.0)', async () => {
    const secureStorage = new StubSecureStorage();
    const services = buildServices(db, { secureStorage });

    expect(services.identity).not.toBeNull();
    expect(typeof services.identity!.createGuestIdentity.execute).toBe('function');
    expect(typeof services.identity!.loadCurrentIdentity.execute).toBe('function');
    expect(services.identity!.authService).toBeNull(); // no auth provider injected

    // End-to-end: onboarding creates the durable guest identity, and the
    // load use case resolves it (secure storage round-trip included).
    const created = await services.identity!.createGuestIdentity.execute({
      displayName: 'Asha',
    });
    expect(created.identity.displayName).toBe('Asha');
    expect(created.identity.upgradeStatus).toBe('local_only');

    const current = await services.identity!.loadCurrentIdentity.execute();
    expect(current.type).toBe('guest');
    expect(current.type === 'guest' && current.identity.displayName).toBe('Asha');

    // Device secret lives ONLY in secure storage (the DB row carries the hash).
    const secret = await secureStorage.get('billlens.guest.device_secret');
    expect(secret).not.toBeNull();
    expect(secret!.length).toBeGreaterThanOrEqual(32);
    const stored = await services.identity!.guestIdentities.findById(
      created.identity.id,
    );
    expect(stored?.deviceSecretHash).not.toBe(secret);
  });

  it('identity bucket is null without secure storage (pure harnesses)', () => {
    const services = buildServices(db);
    expect(services.identity).toBeNull();
  });

  it('wires account deletion read-model over the local repository (v2.4.0)', async () => {
    const secureStorage = new StubSecureStorage();
    const services = buildServices(db, { secureStorage });
    expect(typeof services.identity!.accountDeletion.requestDeletion.execute).toBe('function');

    const status = await services.identity!.accountDeletion.getStatus.execute({
      userId: 'unknown-user' as never,
    });
    expect(status.hasScheduledDeletion).toBe(false);
  });
});
