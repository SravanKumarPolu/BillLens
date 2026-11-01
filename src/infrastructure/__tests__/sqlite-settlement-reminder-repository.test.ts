/**
 * Settlement reminder repository over real SQLite.
 *
 * Covers save/find, the cool-down query, settlement/payer scheduled
 * lookups, version persistence (migration 0014), and delete. Seeded
 * through the real migration runner + domain entity factories.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import { createGroup } from '@domain/entities/group';
import { createGroupMember } from '@domain/entities/group-member';
import {
  asReminderId,
  createSettlementReminder,
  cancelSettlementReminder,
} from '@domain/entities/settlement-reminder';
import { asGroupId } from '@domain/entities/group';
import { asMemberId } from '@domain/entities/group-member';
import { asSettlementId } from '@domain/entities/settlement';
import { asUserId } from '@domain/entities/user';
import { asDateTime } from '@domain/value-objects';

import { createCompositionRoot, type AppServices } from '../composition-root';
import { runMigrations } from '../sqlite/schema';
import { hasSqliteCli, SqliteCliDatabase } from './sqlite-cli-database';

const describeWithSqlite = hasSqliteCli() ? describe : describe.skip;

const GROUP = 'g_rem';
const PAYER = 'm_rem_payer';
const RECEIVER = 'm_rem_receiver';
const USER = 'local-user';
const NOW = '2026-11-01T12:00:00.000Z';

let dir: string;
let db: SqliteCliDatabase;
let services: AppServices;

async function seedSettlement(id: string): Promise<void> {
  await db.run(
    `insert into settlements (
       id, group_id, from_member_id, to_member_id, amount_minor, currency_code,
       method, settlement_date, created_by, created_at, updated_at,
       client_created_at, client_updated_at, version, status
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'pending_confirmation')`,
    [id, GROUP, PAYER, RECEIVER, 12500, 'INR', 'cash', '2026-11-01', USER, NOW, NOW, NOW, NOW],
  );
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'billlens-reminders-'));
  db = new SqliteCliDatabase(join(dir, 'reminders.db'));
  await runMigrations(db);
  services = createCompositionRoot({ database: db });

  await services.repositories.groups.save(
    createGroup({
      id: GROUP as never,
      name: 'Flatmates',
      currencyCode: 'INR',
      createdBy: USER as never,
      now: NOW as never,
    }),
  );
  await services.repositories.members.save(
    createGroupMember({
      id: PAYER as never,
      groupId: GROUP as never,
      userId: USER as never,
      displayName: 'Alice',
      role: 'owner',
      now: NOW as never,
    }),
  );
  await services.repositories.members.save(
    createGroupMember({
      id: RECEIVER as never,
      groupId: GROUP as never,
      displayName: 'Bob',
      role: 'member',
      now: NOW as never,
    }),
  );
  await seedSettlement('st_rem_1');
});

afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function aReminder(id: string, overrides: Record<string, unknown> = {}) {
  return createSettlementReminder({
    id: asReminderId(id),
    groupId: asGroupId(GROUP),
    settlementId: asSettlementId('st_rem_1'),
    payerMemberId: asMemberId(PAYER),
    receiverMemberId: asMemberId(RECEIVER),
    currencyCode: 'INR',
    amountMinor: 12500,
    reminderType: 'pending_confirmation',
    scheduledAt: asDateTime('2026-11-02T12:00:00.000Z'),
    createdBy: asUserId(USER),
    now: asDateTime(NOW),
    ...overrides,
  });
}

describeWithSqlite('SqliteSettlementReminderRepository', () => {
  it('saves, finds by id, and round-trips optional fields + version', async () => {
    const reminder = aReminder('rem_1');
    await services.repositories.settlementReminders.save(reminder);

    const loaded = await services.repositories.settlementReminders.findById('rem_1');
    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe(reminder.id);
    expect(loaded?.groupId).toBe(reminder.groupId);
    expect(loaded?.settlementId).toBe(reminder.settlementId);
    expect(loaded?.payerMemberId).toBe(reminder.payerMemberId);
    expect(loaded?.receiverMemberId).toBe(reminder.receiverMemberId);
    expect(loaded?.amountMinor).toBe(12500);
    expect(loaded?.status).toBe('scheduled');
    expect(loaded?.privacyMode).toBe('private');
    expect(loaded?.version).toBe(reminder.version);
    expect(loaded?.sentAt).toBeUndefined();
    expect(loaded?.cancelledAt).toBeUndefined();
  });

  it('persists a version bump through cancel', async () => {
    const reminder = aReminder('rem_cancel');
    await services.repositories.settlementReminders.save(reminder);
    const cancelled = cancelSettlementReminder(reminder, { now: asDateTime(NOW) });
    await services.repositories.settlementReminders.save(cancelled);

    const loaded = await services.repositories.settlementReminders.findById('rem_cancel');
    expect(loaded?.status).toBe('cancelled');
    expect(loaded?.cancelledAt).toBeDefined();
    expect(Number(loaded?.version)).toBe(Number(reminder.version) + 1);
  });

  it('lists by group and filters by status', async () => {
    const page = await services.repositories.settlementReminders.listByGroup(
      asGroupId(GROUP),
      { status: 'scheduled' },
      { limit: 10 },
    );
    expect(page.items.map((r) => r.id)).toContain('rem_1');
    const cancelledPage = await services.repositories.settlementReminders.listByGroup(
      asGroupId(GROUP),
      { status: 'cancelled' },
      { limit: 10 },
    );
    expect(cancelledPage.items.map((r) => r.id)).toContain('rem_cancel');
  });

  it('finds the most recent scheduled-or-sent reminder for the cool-down tuple', async () => {
    const found = await services.repositories.settlementReminders.findMostRecentForCoolDown(
      asGroupId(GROUP),
      asMemberId(PAYER),
      asMemberId(RECEIVER),
      'INR',
    );
    expect(found).not.toBeNull();
    expect(['scheduled', 'sent']).toContain(found?.status);
    // A different currency must not match.
    const other = await services.repositories.settlementReminders.findMostRecentForCoolDown(
      asGroupId(GROUP),
      asMemberId(PAYER),
      asMemberId(RECEIVER),
      'USD',
    );
    expect(other).toBeNull();
  });

  it('finds scheduled reminders for a settlement and for a payer', async () => {
    const forSettlement =
      await services.repositories.settlementReminders.findScheduledForSettlement(
        asSettlementId('st_rem_1'),
      );
    expect(forSettlement.map((r) => r.id)).toContain('rem_1');
    expect(forSettlement.map((r) => r.status)).not.toContain('cancelled');

    const forPayer = await services.repositories.settlementReminders.findScheduledForPayer(
      asGroupId(GROUP),
      asMemberId(PAYER),
    );
    expect(forPayer.map((r) => r.id)).toContain('rem_1');
  });

  it('deletes by id', async () => {
    const reminder = aReminder('rem_delete');
    await services.repositories.settlementReminders.save(reminder);
    expect(await services.repositories.settlementReminders.findById('rem_delete')).not.toBeNull();
    await services.repositories.settlementReminders.delete('rem_delete');
    expect(await services.repositories.settlementReminders.findById('rem_delete')).toBeNull();
  });
});
