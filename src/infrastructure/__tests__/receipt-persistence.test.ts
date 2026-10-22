/**
 * Receipt persistence from a confirmed OCR draft.
 * Verifies metadata, items, item-level splits and deletion cleanup intent.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import { createGroup } from '@domain/entities/group';
import { createGroupMember } from '@domain/entities/group-member';
import { createExpenseDraft } from '@domain/entities/expense-draft';
import { createDraftLineItem } from '@domain/entities/draft-line-item';
import { createDraftCharge } from '@domain/entities/draft-charge';
import { createCompositionRoot, type AppServices } from '@infrastructure/composition-root';
import { runMigrations } from '@infrastructure/sqlite/schema';
import { hasSqliteCli, SqliteCliDatabase } from './sqlite-cli-database';

const describeWithSqlite = hasSqliteCli() ? describe : describe.skip;
const GROUP = 'g_receipt_history';
const A = 'm_receipt_a';
const B = 'm_receipt_b';
const USER = 'local-user';
const DRAFT = 'd_receipt_history';

let dir: string;
let db: SqliteCliDatabase;
let services: AppServices;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'billlens-receipts-'));
  db = new SqliteCliDatabase(join(dir, 'receipts.db'));
  await runMigrations(db);
  services = createCompositionRoot({ database: db });
  await services.repositories.groups.save(
    createGroup({
      id: GROUP as never,
      name: 'Receipt group',
      currencyCode: 'INR',
      createdBy: USER as never,
      now: '2026-10-01T00:00:00.000Z' as never,
    }),
  );
  for (const [id, name, role] of [
    [A, 'Asha', 'owner'],
    [B, 'Bilal', 'member'],
  ] as const) {
    await services.repositories.members.save(
      createGroupMember({
        id: id as never,
        groupId: GROUP as never,
        displayName: name,
        role: role as never,
        now: '2026-10-01T00:00:00.000Z' as never,
      }),
    );
  }

  const draft = createExpenseDraft({
    id: DRAFT as never,
    groupId: GROUP as never,
    source: 'receipt',
    title: 'Dinner',
    amountMinor: 10_000,
    currencyCode: 'INR',
    merchantName: 'Udupi',
    expenseDate: '2026-10-20',
    payerCandidates: [A as never],
    participantCandidates: [A as never, B as never],
    lineItems: [
      createDraftLineItem({
        id: 'di1' as never,
        name: 'Dosa',
        quantity: 2,
        unitPriceMinor: 3_000,
        assignedMemberIds: [A as never, B as never],
      }),
      createDraftLineItem({
        id: 'di2' as never,
        name: 'Coffee',
        quantity: 1,
        unitPriceMinor: 3_000,
        assignedMemberIds: [B as never],
      }),
    ],
    charges: [
      createDraftCharge({ id: 'dc1' as never, type: 'tax', amountMinor: 1_000 }),
    ],
    createdBy: USER as never,
    now: '2026-10-20T00:00:00.000Z' as never,
  });
  await services.repositories.drafts.save({ ...draft, status: 'needs_review' });
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describeWithSqlite('receipt persistence', () => {
  it('saves the receipt, items and item-level expense on confirmation', async () => {
    const result = await services.capture.createExpenseFromDraft.execute({
      draftId: DRAFT as never,
      groupId: GROUP,
      expectedVersion: 1,
      imageUri: 'file:///tmp/receipt.jpg',
    });
    expect(result.receiptId).toBe(`receipt-${DRAFT}`);

    const receipt = await db.get<{ total_amount_minor: number; image_uri: string }>(
      'select total_amount_minor, image_uri from receipts where id = ?',
      [`receipt-${DRAFT}`],
    );
    expect(receipt?.total_amount_minor).toBe(10_000);
    expect(receipt?.image_uri).toBe('file:///tmp/receipt.jpg');

    const items = await db.all<{ name: string }>(
      'select name from receipt_items where receipt_id = ? order by name',
      [`receipt-${DRAFT}`],
    );
    expect(items.map((item) => item.name)).toEqual(['Coffee', 'Dosa']);

    const expense = await db.get<{ split_type: string; receipt_id: string }>(
      'select split_type, receipt_id from expenses where id = ?',
      [result.expenseId],
    );
    expect(expense?.split_type).toBe('items');
    expect(expense?.receipt_id).toBe(`receipt-${DRAFT}`);

    const splits = await db.all<{ member_id: string; amount_minor: number }>(
      'select member_id, amount_minor from expense_splits where expense_id = ? order by member_id',
      [result.expenseId],
    );
    expect(splits).toEqual([
      { member_id: A, amount_minor: 3_333 },
      { member_id: B, amount_minor: 6_667 },
    ]);

    const history = await services.receipts.listHistory.execute([GROUP]);
    expect(history).toHaveLength(1);
    expect(history[0]?.merchantName).toBe('Udupi');
  });

  it('soft-deletes a receipt and queues its image for cleanup', async () => {
    const receiptId = `receipt-${DRAFT}`;
    await services.receipts.deleteReceipt.execute(receiptId);

    const row = await db.get<{ deleted_at: string | null }>(
      'select deleted_at from receipts where id = ?',
      [receiptId],
    );
    expect(row?.deleted_at).not.toBeNull();

    const queued = await db.get<{ count: number }>(
      "select count(*) as count from file_cleanup_queue where uri = 'file:///tmp/receipt.jpg'",
    );
    expect(queued?.count).toBe(1);

    const history = await services.receipts.listHistory.execute([GROUP]);
    expect(history).toHaveLength(0);
  });
});
