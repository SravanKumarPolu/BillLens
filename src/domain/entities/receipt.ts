import type { GroupId, ReceiptId, UserId } from '@shared-types/index';

import { InvalidEntityError, ValueTooLongError } from '../errors/index';
import {
  type CurrencyCode,
  type DateTime,
  type VersionNumber,
  asCurrencyCode,
  asDateTime,
  initialVersionNumber,
  nowDateTime,
} from '../value-objects/index';


export function asReceiptId(value: string): ReceiptId {
  return value as ReceiptId;
}

export type ReceiptSource =
  | 'paper'
  | 'gallery'
  | 'upi_screenshot'
  | 'card_screenshot'
  | 'bank_screenshot'
  | 'digital_invoice'
  | 'shared_image';

export type StorageMode =
  | 'local_only'
  | 'cloud_private'
  | 'shared_with_group'
  | 'delete_after_extraction';

export interface ReceiptPrivacyPreference {
  readonly storageMode: StorageMode;
  readonly retainRawText: boolean;
  readonly retainSourceImage: boolean;
  readonly retentionDays?: number;
}

export const DEFAULT_PRIVACY_PREFERENCE: ReceiptPrivacyPreference = {
  storageMode: 'local_only',
  retainRawText: false,
  retainSourceImage: true,
  retentionDays: 30,
};

export interface Receipt {
  readonly id: ReceiptId;
  readonly groupId: GroupId;
  readonly source: ReceiptSource;
  readonly merchantName?: string;
  readonly currencyCode?: CurrencyCode;
  readonly totalAmountMinor?: number;
  readonly subtotalAmountMinor?: number;
  readonly taxAmountMinor?: number;
  readonly receiptDate?: DateTime;
  /** Local URI (FileSystem) or cloud URI (Supabase Storage signed URL). */
  readonly imageUri?: string;
  /** SHA-256 hash of the image bytes — used for duplicate detection. */
  readonly imageHash?: string;
  readonly privacy: ReceiptPrivacyPreference;
  readonly uploadedBy: UserId;
  readonly createdAt: DateTime;
  readonly updatedAt: DateTime;
  readonly deletedAt?: DateTime;
  readonly version: VersionNumber;
}

export interface ReceiptCreateInput {
  readonly id: ReceiptId;
  readonly groupId: GroupId;
  readonly source: ReceiptSource;
  readonly merchantName?: string;
  readonly currencyCode?: string;
  readonly totalAmountMinor?: number;
  readonly subtotalAmountMinor?: number;
  readonly taxAmountMinor?: number;
  readonly receiptDate?: string;
  readonly imageUri?: string;
  readonly imageHash?: string;
  readonly privacy?: Partial<ReceiptPrivacyPreference>;
  readonly uploadedBy: UserId;
  readonly now?: DateTime;
}

export function createReceipt(input: ReceiptCreateInput): Receipt {
  if (input.merchantName !== undefined && input.merchantName.length > 200) {
    throw new ValueTooLongError(
      `Receipt merchant name too long: ${input.merchantName.length}`,
      'merchantName',
      200,
      input.merchantName.length,
    );
  }
  if (
    input.totalAmountMinor !== undefined &&
    (!Number.isInteger(input.totalAmountMinor) || input.totalAmountMinor < 0)
  ) {
    throw new InvalidEntityError(
      `Receipt total must be a non-negative integer, got ${input.totalAmountMinor}`,
    );
  }
  if (
    input.subtotalAmountMinor !== undefined &&
    (!Number.isInteger(input.subtotalAmountMinor) || input.subtotalAmountMinor < 0)
  ) {
    throw new InvalidEntityError(
      `Receipt subtotal must be a non-negative integer, got ${input.subtotalAmountMinor}`,
    );
  }
  if (
    input.taxAmountMinor !== undefined &&
    (!Number.isInteger(input.taxAmountMinor) || input.taxAmountMinor < 0)
  ) {
    throw new InvalidEntityError(
      `Receipt tax must be a non-negative integer, got ${input.taxAmountMinor}`,
    );
  }
  const now = input.now ?? nowDateTime();
  const inputPrivacy = input.privacy ?? {};
  const filteredPrivacy: Partial<ReceiptPrivacyPreference> = {};
  for (const [key, value] of Object.entries(inputPrivacy)) {
    if (value !== undefined) {
      (filteredPrivacy as Record<string, unknown>)[key] = value;
    }
  }
  const privacy: ReceiptPrivacyPreference = {
    ...DEFAULT_PRIVACY_PREFERENCE,
    ...filteredPrivacy,
  };
  return {
    id: input.id,
    groupId: input.groupId,
    source: input.source,
    ...(input.merchantName !== undefined ? { merchantName: input.merchantName.trim() } : {}),
    ...(input.currencyCode !== undefined ? { currencyCode: asCurrencyCode(input.currencyCode) } : {}),
    ...(input.totalAmountMinor !== undefined ? { totalAmountMinor: input.totalAmountMinor } : {}),
    ...(input.subtotalAmountMinor !== undefined ? { subtotalAmountMinor: input.subtotalAmountMinor } : {}),
    ...(input.taxAmountMinor !== undefined ? { taxAmountMinor: input.taxAmountMinor } : {}),
    ...(input.receiptDate !== undefined ? { receiptDate: asDateTime(input.receiptDate) } : {}),
    ...(input.imageUri !== undefined ? { imageUri: input.imageUri } : {}),
    ...(input.imageHash !== undefined ? { imageHash: input.imageHash } : {}),
    privacy,
    uploadedBy: input.uploadedBy,
    createdAt: asDateTime(now),
    updatedAt: asDateTime(now),
    version: initialVersionNumber(),
  };
}

export function isReceiptActive(receipt: Receipt): boolean {
  return receipt.deletedAt === undefined;
}
