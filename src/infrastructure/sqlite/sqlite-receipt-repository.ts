/** SQLite receipt + receipt-item repository (receipt history / backup source). */

import type { Receipt } from '@domain/entities/receipt';
import type { ReceiptItem } from '@domain/entities/receipt-item';
import type { ReceiptRepository } from '@domain/repositories/receipt.repository';
import type {
  DeleteMetadata,
  PaginatedResult,
  Pagination,
  SoftDeleteResult,
} from '@domain/repositories/repository-contracts';
import { asCurrencyCode, asDateTime, asVersionNumber } from '@domain/value-objects';
import type { GroupId, MemberId, ReceiptId, UserId } from '@shared-types/index';

import type { DatabaseConnection, SqlRow } from './database-connection';
import { paginateRows, parseOffsetCursor } from './row-mappers';

function mapReceipt(row: SqlRow): Receipt {
  return {
    id: row.id as ReceiptId,
    groupId: row.group_id as GroupId,
    source: row.source as Receipt['source'],
    ...(row.merchant_name ? { merchantName: row.merchant_name as string } : {}),
    ...(row.currency_code ? { currencyCode: asCurrencyCode(row.currency_code as string) } : {}),
    ...(row.total_amount_minor !== null && row.total_amount_minor !== undefined
      ? { totalAmountMinor: Number(row.total_amount_minor) }
      : {}),
    ...(row.subtotal_amount_minor !== null && row.subtotal_amount_minor !== undefined
      ? { subtotalAmountMinor: Number(row.subtotal_amount_minor) }
      : {}),
    ...(row.tax_amount_minor !== null && row.tax_amount_minor !== undefined
      ? { taxAmountMinor: Number(row.tax_amount_minor) }
      : {}),
    ...(row.receipt_date ? { receiptDate: asDateTime(row.receipt_date as string) } : {}),
    ...(row.image_uri ? { imageUri: row.image_uri as string } : {}),
    ...(row.image_hash ? { imageHash: row.image_hash as string } : {}),
    privacy: {
      storageMode: (row.storage_mode as Receipt['privacy']['storageMode']) ?? 'local_only',
      retainRawText: Number(row.retain_raw_text) === 1,
      retainSourceImage: Number(row.retain_source_image) === 1,
      ...(row.retention_days ? { retentionDays: Number(row.retention_days) } : {}),
    },
    uploadedBy: row.uploaded_by as UserId,
    createdAt: asDateTime(row.created_at as string),
    updatedAt: asDateTime(row.updated_at as string),
    ...(row.deleted_at ? { deletedAt: asDateTime(row.deleted_at as string) } : {}),
    version: asVersionNumber(Number(row.version)),
  };
}

function mapItem(row: SqlRow): ReceiptItem {
  let assigned: MemberId[] = [];
  try {
    const parsed: unknown = JSON.parse(String(row.assigned_member_ids ?? '[]'));
    if (Array.isArray(parsed)) assigned = parsed as MemberId[];
  } catch {
    assigned = [];
  }
  return {
    id: row.id as ReceiptItem['id'],
    receiptId: row.receipt_id as ReceiptId,
    name: row.name as string,
    quantity: Number(row.quantity),
    unitPriceMinor: Number(row.unit_price_minor),
    ...(row.discount_minor != null ? { discountMinor: Number(row.discount_minor) } : {}),
    ...(row.tax_minor != null ? { taxMinor: Number(row.tax_minor) } : {}),
    totalAmountMinor: Number(row.total_amount_minor),
    assignedMemberIds: assigned,
    createdAt: asDateTime(row.created_at as string),
    updatedAt: asDateTime(row.updated_at as string),
    ...(row.deleted_at ? { deletedAt: asDateTime(row.deleted_at as string) } : {}),
    version: asVersionNumber(Number(row.version)),
  };
}

export class SqliteReceiptRepository implements ReceiptRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async findById(id: ReceiptId): Promise<Receipt | null> {
    const row = await this.db.get<SqlRow>('select * from receipts where id = ?', [id]);
    return row ? mapReceipt(row) : null;
  }

  async listByGroup(groupId: GroupId, pagination: Pagination): Promise<PaginatedResult<Receipt>> {
    const offset = parseOffsetCursor(pagination.cursor);
    const rows = await this.db.all<SqlRow>(
      `select * from receipts where group_id = ? and deleted_at is null
       order by created_at desc limit ? offset ?`,
      [groupId, pagination.limit + 1, offset],
    );
    return paginateRows(rows.map(mapReceipt), pagination.limit, offset);
  }

  async listItems(receiptId: ReceiptId): Promise<readonly ReceiptItem[]> {
    const rows = await this.db.all<SqlRow>(
      'select * from receipt_items where receipt_id = ? and deleted_at is null order by created_at asc',
      [receiptId],
    );
    return rows.map(mapItem);
  }

  async save(receipt: Receipt, items: readonly ReceiptItem[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.run(
        `insert into receipts (
           id, group_id, source, merchant_name, currency_code, total_amount_minor,
           subtotal_amount_minor, tax_amount_minor, receipt_date, image_uri, image_hash,
           storage_mode, retain_raw_text, retain_source_image, retention_days,
           uploaded_by, created_at, updated_at, deleted_at, version,
           client_created_at, client_updated_at
         ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(id) do update set
           merchant_name = excluded.merchant_name, currency_code = excluded.currency_code,
           total_amount_minor = excluded.total_amount_minor,
           subtotal_amount_minor = excluded.subtotal_amount_minor,
           tax_amount_minor = excluded.tax_amount_minor, receipt_date = excluded.receipt_date,
           image_uri = excluded.image_uri, image_hash = excluded.image_hash,
           storage_mode = excluded.storage_mode, retain_raw_text = excluded.retain_raw_text,
           retain_source_image = excluded.retain_source_image,
           retention_days = excluded.retention_days, updated_at = excluded.updated_at,
           deleted_at = excluded.deleted_at, version = excluded.version,
           client_updated_at = excluded.client_updated_at`,
        [
          receipt.id, receipt.groupId, receipt.source, receipt.merchantName ?? null,
          receipt.currencyCode ?? null, receipt.totalAmountMinor ?? null,
          receipt.subtotalAmountMinor ?? null, receipt.taxAmountMinor ?? null,
          receipt.receiptDate ?? null, receipt.imageUri ?? null, receipt.imageHash ?? null,
          receipt.privacy.storageMode, receipt.privacy.retainRawText ? 1 : 0,
          receipt.privacy.retainSourceImage ? 1 : 0, receipt.privacy.retentionDays ?? null,
          receipt.uploadedBy, receipt.createdAt, receipt.updatedAt,
          receipt.deletedAt ?? null, receipt.version, receipt.createdAt, receipt.updatedAt,
        ],
      );
      await tx.run('delete from receipt_items where receipt_id = ?', [receipt.id]);
      for (const item of items) {
        await tx.run(
          `insert into receipt_items (
             id, receipt_id, name, quantity, unit_price_minor, discount_minor, tax_minor,
             total_amount_minor, assigned_member_ids, created_at, updated_at, deleted_at,
             version, created_by, client_created_at, client_updated_at
           ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id, receipt.id, item.name, item.quantity, item.unitPriceMinor,
            item.discountMinor ?? null, item.taxMinor ?? null, item.totalAmountMinor,
            JSON.stringify(item.assignedMemberIds), item.createdAt, item.updatedAt,
            item.deletedAt ?? null, item.version, receipt.uploadedBy, item.createdAt,
            item.updatedAt,
          ],
        );
      }
    });
  }

  async softDelete(id: ReceiptId, metadata: DeleteMetadata): Promise<SoftDeleteResult> {
    const row = await this.db.get<{ version: number; deleted_at: string | null }>(
      'select version, deleted_at from receipts where id = ?',
      [id],
    );
    if (row === null) {
      return { id, deletedAt: metadata.deletedAt, version: asVersionNumber(0) };
    }
    if (row.deleted_at !== null) {
      return {
        id,
        deletedAt: asDateTime(row.deleted_at),
        version: asVersionNumber(Number(row.version)),
      };
    }
    const version = Number(row.version) + 1;
    await this.db.run(
      'update receipts set deleted_at = ?, updated_at = ?, version = ? where id = ?',
      [metadata.deletedAt, metadata.deletedAt, version, id],
    );
    return { id, deletedAt: metadata.deletedAt, version: asVersionNumber(version) };
  }

  async findByImageHash(hash: string): Promise<readonly Receipt[]> {
    const rows = await this.db.all<SqlRow>(
      'select * from receipts where image_hash = ? and deleted_at is null',
      [hash],
    );
    return rows.map(mapReceipt);
  }
}
