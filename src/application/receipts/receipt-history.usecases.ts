/** Receipt history and guarded receipt deletion (metadata + queued image file). */

import type { GroupRepository } from '@domain/repositories/group.repository';
import type { ReceiptRepository } from '@domain/repositories/receipt.repository';
import type { ReceiptId } from '@shared-types/index';
import { asDateTime } from '@domain/value-objects';

export interface ReceiptHistoryRow {
  readonly id: string;
  readonly groupId: string;
  readonly groupName: string;
  readonly merchantName: string | null;
  readonly totalAmountMinor: number | null;
  readonly currencyCode: string | null;
  readonly receiptDate: string | null;
  readonly imageUri: string | null;
  readonly createdAt: string;
}

export class ListReceiptHistoryUseCase {
  constructor(
    private readonly receipts: ReceiptRepository,
    private readonly groups: GroupRepository,
  ) {}

  async execute(groupIds: readonly string[], limit = 50): Promise<readonly ReceiptHistoryRow[]> {
    const rows: ReceiptHistoryRow[] = [];
    for (const groupId of groupIds) {
      const group = await this.groups.findById(groupId as never);
      if (group === null) continue;
      const page = await this.receipts.listByGroup(groupId as never, { limit: 50 });
      for (const receipt of page.items) {
        rows.push({
          id: receipt.id as string,
          groupId,
          groupName: group.name,
          merchantName: receipt.merchantName ?? null,
          totalAmountMinor: receipt.totalAmountMinor ?? null,
          currencyCode: receipt.currencyCode ? (receipt.currencyCode as string) : null,
          receiptDate: receipt.receiptDate ? (receipt.receiptDate as string) : null,
          imageUri: receipt.imageUri ?? null,
          createdAt: receipt.createdAt as string,
        });
      }
    }
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }
}

export interface ReceiptFileCleanupPort {
  enqueueCleanup(uris: readonly string[], nowIso: string): Promise<number>;
}

export class DeleteReceiptUseCase {
  constructor(
    private readonly receipts: ReceiptRepository,
    private readonly cleanup: ReceiptFileCleanupPort,
  ) {}

  async execute(receiptId: string): Promise<void> {
    const receipt = await this.receipts.findById(receiptId as ReceiptId);
    if (receipt === null || receipt.deletedAt !== undefined) return;
    const now = new Date().toISOString();
    await this.receipts.softDelete(receiptId as ReceiptId, {
      actorId: receipt.uploadedBy,
      deletedAt: asDateTime(now),
    });
    if (receipt.imageUri !== undefined) {
      await this.cleanup.enqueueCleanup([receipt.imageUri], now);
    }
  }
}
