import {
  asExpenseId,
  asExpensePayerId,
  asExpenseSplitId,
  asGroupId,
  asGuestIdentityId,
  asInviteId,
  asInviteToken,
  asMemberId,
  asReceiptId,
  asReceiptItemId,
  asSettlementId,
  asUserId,
  type Expense,
  type ExpensePayer,
  type ExpenseSplit,
  type Group,
  type GroupId,
  type GroupInvite,
  type GroupMember,
  type GuestIdentity,
  type MemberId,
  type Receipt,
  type ReceiptItem,
  type Settlement,
  type User,
  type UserId,
} from '@domain/entities';
import type {
  AuditLogEntry,
} from '@domain/repositories/audit.repository';
import type {
  SyncOperation,
} from '@domain/repositories/sync.repository';
import {
  asBasisPoints,
  asCurrencyCode,
  asDateTime,
  asDisplayName,
  asShareUnits,
  asVersionNumber,
  type BasisPoints,
  type CurrencyCode,
  type DateTime,
  type DisplayName,
  type EmailAddress,
  type ShareUnits,
  type VersionNumber,
} from '@domain/value-objects';

/**
 * Mappers between database rows (raw objects from SQLite/Supabase) and
 * domain entities.
 *
 * The mapping boundary is critical: the application layer NEVER passes
 * raw DB rows to the presentation layer. Every row is mapped to a
 * domain entity (or a query read-model) before crossing the boundary.
 *
 * Mapper conventions:
 *   - `toEntity(row)` — convert a DB row to a domain entity.
 *   - `toRow(entity)` — convert a domain entity to a DB row (for inserts/updates).
 *   - Mappers are PURE functions — no side effects, no I/O.
 *   - Mappers throw `InvalidEntityError` if the row is missing required
 *     fields or has invalid data.
 */

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export interface UserRow {
  readonly id: string;
  readonly display_name: string;
  readonly email: string;
  readonly avatar_url: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
  readonly version: number;
  readonly created_by: string | null;
  readonly last_modified_by: string | null;
  readonly client_created_at: string;
  readonly client_updated_at: string;
}

export const UserMapper = {
  toEntity(row: UserRow): User {
    return {
      id: asUserId(row.id),
      displayName: asDisplayName(row.display_name) as DisplayName,
      email: row.email.toLowerCase() as EmailAddress,
      ...(row.avatar_url !== null ? { avatarUrl: row.avatar_url } : {}),
      createdAt: asDateTime(row.created_at) as DateTime,
      updatedAt: asDateTime(row.updated_at) as DateTime,
      ...(row.deleted_at !== null ? { deletedAt: asDateTime(row.deleted_at) as DateTime } : {}),
      version: asVersionNumber(row.version) as VersionNumber,
    };
  },

  toRow(entity: User): UserRow {
    return {
      id: entity.id as string,
      display_name: entity.displayName as string,
      email: entity.email as string,
      avatar_url: entity.avatarUrl ?? null,
      created_at: entity.createdAt as string,
      updated_at: entity.updatedAt as string,
      deleted_at: entity.deletedAt ? (entity.deletedAt as string) : null,
      version: entity.version as number,
      created_by: null,
      last_modified_by: null,
      client_created_at: entity.createdAt as string,
      client_updated_at: entity.updatedAt as string,
    };
  },
};

// ---------------------------------------------------------------------------
// Group
// ---------------------------------------------------------------------------

export interface GroupRow {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly currency_code: string;
  readonly created_by: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
  readonly version: number;
  readonly last_modified_by: string | null;
  readonly client_created_at: string;
  readonly client_updated_at: string;
}

export const GroupMapper = {
  toEntity(row: GroupRow): Group {
    return {
      id: asGroupId(row.id) as GroupId,
      name: row.name,
      ...(row.description !== null ? { description: row.description } : {}),
      currencyCode: asCurrencyCode(row.currency_code) as CurrencyCode,
      createdBy: asUserId(row.created_by) as UserId,
      createdAt: asDateTime(row.created_at) as DateTime,
      updatedAt: asDateTime(row.updated_at) as DateTime,
      ...(row.deleted_at !== null ? { deletedAt: asDateTime(row.deleted_at) as DateTime } : {}),
      version: asVersionNumber(row.version) as VersionNumber,
    };
  },

  toRow(entity: Group): GroupRow {
    return {
      id: entity.id as string,
      name: entity.name,
      description: entity.description ?? null,
      currency_code: entity.currencyCode as string,
      created_by: entity.createdBy as string,
      created_at: entity.createdAt as string,
      updated_at: entity.updatedAt as string,
      deleted_at: entity.deletedAt ? (entity.deletedAt as string) : null,
      version: entity.version as number,
      last_modified_by: null,
      client_created_at: entity.createdAt as string,
      client_updated_at: entity.updatedAt as string,
    };
  },
};

// ---------------------------------------------------------------------------
// GroupMember
// ---------------------------------------------------------------------------

export interface GroupMemberRow {
  readonly id: string;
  readonly group_id: string;
  readonly user_id: string | null;
  readonly display_name: string;
  readonly role: 'owner' | 'admin' | 'member';
  readonly joined_at: string;
  readonly left_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly version: number;
  readonly created_by: string | null;
  readonly last_modified_by: string | null;
  readonly client_created_at: string;
  readonly client_updated_at: string;
}

export const GroupMemberMapper = {
  toEntity(row: GroupMemberRow): GroupMember {
    return {
      id: asMemberId(row.id) as MemberId,
      groupId: asGroupId(row.group_id) as GroupId,
      ...(row.user_id !== null ? { userId: asUserId(row.user_id) as UserId } : {}),
      displayName: asDisplayName(row.display_name) as DisplayName,
      role: row.role,
      joinedAt: asDateTime(row.joined_at) as DateTime,
      updatedAt: asDateTime(row.updated_at) as DateTime,
      ...(row.left_at !== null ? { leftAt: asDateTime(row.left_at) as DateTime } : {}),
      version: asVersionNumber(row.version) as VersionNumber,
    };
  },

  toRow(entity: GroupMember): GroupMemberRow {
    return {
      id: entity.id as string,
      group_id: entity.groupId as string,
      user_id: entity.userId ? (entity.userId as string) : null,
      display_name: entity.displayName as string,
      role: entity.role,
      joined_at: entity.joinedAt as string,
      left_at: entity.leftAt ? (entity.leftAt as string) : null,
      created_at: entity.joinedAt as string,
      updated_at: entity.updatedAt as string,
      version: entity.version as number,
      created_by: null,
      last_modified_by: null,
      client_created_at: entity.joinedAt as string,
      client_updated_at: entity.updatedAt as string,
    };
  },
};

// ---------------------------------------------------------------------------
// Expense
// ---------------------------------------------------------------------------

export interface ExpenseRow {
  readonly id: string;
  readonly group_id: string;
  readonly title: string;
  readonly amount_minor: number;
  readonly currency_code: string;
  readonly expense_date: string;
  readonly split_type: 'equal' | 'exact' | 'percentage' | 'shares' | 'items';
  readonly receipt_id: string | null;
  readonly note: string | null;
  readonly category: string | null;
  readonly created_by: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
  readonly version: number;
  readonly last_modified_by: string | null;
  readonly client_created_at: string;
  readonly client_updated_at: string;
}

export const ExpenseMapper = {
  toEntity(row: ExpenseRow): Expense {
    return {
      id: asExpenseId(row.id),
      groupId: asGroupId(row.group_id) as GroupId,
      title: row.title,
      amountMinor: row.amount_minor,
      currencyCode: asCurrencyCode(row.currency_code) as CurrencyCode,
      expenseDate: asDateTime(row.expense_date) as DateTime,
      splitType: row.split_type,
      ...(row.receipt_id !== null ? { receiptId: asReceiptId(row.receipt_id) } : {}),
      ...(row.note !== null ? { note: row.note } : {}),
      ...(row.category !== null ? { category: row.category } : {}),
      createdBy: asUserId(row.created_by) as UserId,
      createdAt: asDateTime(row.created_at) as DateTime,
      updatedAt: asDateTime(row.updated_at) as DateTime,
      ...(row.deleted_at !== null ? { deletedAt: asDateTime(row.deleted_at) as DateTime } : {}),
      version: asVersionNumber(row.version) as VersionNumber,
    };
  },

  toRow(entity: Expense): ExpenseRow {
    return {
      id: entity.id as string,
      group_id: entity.groupId as string,
      title: entity.title,
      amount_minor: entity.amountMinor,
      currency_code: entity.currencyCode as string,
      expense_date: entity.expenseDate as string,
      split_type: entity.splitType,
      receipt_id: entity.receiptId ? (entity.receiptId as string) : null,
      note: entity.note ?? null,
      category: entity.category ?? null,
      created_by: entity.createdBy as string,
      created_at: entity.createdAt as string,
      updated_at: entity.updatedAt as string,
      deleted_at: entity.deletedAt ? (entity.deletedAt as string) : null,
      version: entity.version as number,
      last_modified_by: null,
      client_created_at: entity.createdAt as string,
      client_updated_at: entity.updatedAt as string,
    };
  },
};

// ---------------------------------------------------------------------------
// ExpensePayer
// ---------------------------------------------------------------------------

export interface ExpensePayerRow {
  readonly id: string;
  readonly expense_id: string;
  readonly member_id: string;
  readonly amount_minor: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
  readonly version: number;
  readonly created_by: string | null;
  readonly last_modified_by: string | null;
  readonly client_created_at: string;
  readonly client_updated_at: string;
}

export const ExpensePayerMapper = {
  toEntity(row: ExpensePayerRow): ExpensePayer {
    return {
      id: asExpensePayerId(row.id),
      expenseId: asExpenseId(row.expense_id),
      memberId: asMemberId(row.member_id) as MemberId,
      amountMinor: row.amount_minor,
      createdAt: asDateTime(row.created_at) as DateTime,
      updatedAt: asDateTime(row.updated_at) as DateTime,
      ...(row.deleted_at !== null ? { deletedAt: asDateTime(row.deleted_at) as DateTime } : {}),
      version: asVersionNumber(row.version) as VersionNumber,
    };
  },

  toRow(entity: ExpensePayer): ExpensePayerRow {
    return {
      id: entity.id as string,
      expense_id: entity.expenseId as string,
      member_id: entity.memberId as string,
      amount_minor: entity.amountMinor,
      created_at: entity.createdAt as string,
      updated_at: entity.updatedAt as string,
      deleted_at: entity.deletedAt ? (entity.deletedAt as string) : null,
      version: entity.version as number,
      created_by: null,
      last_modified_by: null,
      client_created_at: entity.createdAt as string,
      client_updated_at: entity.updatedAt as string,
    };
  },
};

// ---------------------------------------------------------------------------
// ExpenseSplit
// ---------------------------------------------------------------------------

export interface ExpenseSplitRow {
  readonly id: string;
  readonly expense_id: string;
  readonly member_id: string;
  readonly amount_minor: number;
  readonly percentage_basis_points: number | null;
  readonly share_units: number | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
  readonly version: number;
  readonly created_by: string | null;
  readonly last_modified_by: string | null;
  readonly client_created_at: string;
  readonly client_updated_at: string;
}

export const ExpenseSplitMapper = {
  toEntity(row: ExpenseSplitRow): ExpenseSplit {
    return {
      id: asExpenseSplitId(row.id),
      expenseId: asExpenseId(row.expense_id),
      memberId: asMemberId(row.member_id) as MemberId,
      amountMinor: row.amount_minor,
      ...(row.percentage_basis_points !== null
        ? { percentageBasisPoints: asBasisPoints(row.percentage_basis_points) as BasisPoints }
        : {}),
      ...(row.share_units !== null ? { shareUnits: asShareUnits(row.share_units) as ShareUnits } : {}),
      createdAt: asDateTime(row.created_at) as DateTime,
      updatedAt: asDateTime(row.updated_at) as DateTime,
      ...(row.deleted_at !== null ? { deletedAt: asDateTime(row.deleted_at) as DateTime } : {}),
      version: asVersionNumber(row.version) as VersionNumber,
    };
  },

  toRow(entity: ExpenseSplit): ExpenseSplitRow {
    return {
      id: entity.id as string,
      expense_id: entity.expenseId as string,
      member_id: entity.memberId as string,
      amount_minor: entity.amountMinor,
      percentage_basis_points: entity.percentageBasisPoints ?? null,
      share_units: entity.shareUnits ?? null,
      created_at: entity.createdAt as string,
      updated_at: entity.updatedAt as string,
      deleted_at: entity.deletedAt ? (entity.deletedAt as string) : null,
      version: entity.version as number,
      created_by: null,
      last_modified_by: null,
      client_created_at: entity.createdAt as string,
      client_updated_at: entity.updatedAt as string,
    };
  },
};

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

export interface SettlementRow {
  readonly id: string;
  readonly group_id: string;
  readonly from_member_id: string;
  readonly to_member_id: string;
  readonly amount_minor: number;
  readonly currency_code: string;
  // Phase 6: card and wallet added to the method union
  readonly method: 'cash' | 'upi' | 'bank_transfer' | 'card' | 'wallet' | 'other';
  readonly settlement_date: string;
  readonly note: string | null;
  readonly reverses_settlement_id: string | null;
  readonly reversal_of_settlement_id: string | null;
  readonly created_by: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
  readonly version: number;
  readonly last_modified_by: string | null;
  readonly client_created_at: string;
  readonly client_updated_at: string;
  // ── Phase 6 Track 1 additions (nullable for backwards compatibility) ──
  readonly status: string | null;
  readonly confirmed_by_member_id: string | null;
  readonly confirmed_at: string | null;
  readonly payment_reference_hash: string | null;
  readonly operation_id: string | null;
  readonly evidence_hash: string | null;
  readonly dispute_reason: string | null;
  readonly dispute_note: string | null;
}

export const SettlementMapper = {
  toEntity(row: SettlementRow): Settlement {
    return {
      id: asSettlementId(row.id),
      groupId: asGroupId(row.group_id) as GroupId,
      fromMemberId: asMemberId(row.from_member_id) as MemberId,
      toMemberId: asMemberId(row.to_member_id) as MemberId,
      amountMinor: row.amount_minor,
      currencyCode: asCurrencyCode(row.currency_code) as CurrencyCode,
      method: row.method,
      settlementDate: asDateTime(row.settlement_date) as DateTime,
      ...(row.note !== null ? { note: row.note } : {}),
      ...(row.reverses_settlement_id !== null
        ? { reversesSettlementId: asSettlementId(row.reverses_settlement_id) }
        : {}),
      ...(row.reversal_of_settlement_id !== null
        ? { reversalOfSettlementId: asSettlementId(row.reversal_of_settlement_id) }
        : {}),
      createdBy: asUserId(row.created_by) as UserId,
      createdAt: asDateTime(row.created_at) as DateTime,
      updatedAt: asDateTime(row.updated_at) as DateTime,
      ...(row.deleted_at !== null ? { deletedAt: asDateTime(row.deleted_at) as DateTime } : {}),
      version: asVersionNumber(row.version) as VersionNumber,
      // Phase 6 Track 1: hydrate new optional fields. A NULL status
      // (pre-migration row) is treated as 'completed' for backwards
      // compatibility — see `isSettlementCompleted` in the entity.
      ...(row.status !== null ? { status: row.status as Settlement['status'] } : {}),
      ...(row.confirmed_by_member_id !== null
        ? { confirmedByMemberId: asMemberId(row.confirmed_by_member_id) as MemberId }
        : {}),
      ...(row.confirmed_at !== null
        ? { confirmedAt: asDateTime(row.confirmed_at) as DateTime }
        : {}),
      ...(row.payment_reference_hash !== null
        ? { paymentReferenceHash: row.payment_reference_hash }
        : {}),
      ...(row.operation_id !== null ? { operationId: row.operation_id } : {}),
      ...(row.evidence_hash !== null ? { evidenceHash: row.evidence_hash } : {}),
      ...(row.dispute_reason !== null
        ? { disputeReason: row.dispute_reason as Settlement['disputeReason'] }
        : {}),
      ...(row.dispute_note !== null ? { disputeNote: row.dispute_note } : {}),
    };
  },

  toRow(entity: Settlement): SettlementRow {
    return {
      id: entity.id as string,
      group_id: entity.groupId as string,
      from_member_id: entity.fromMemberId as string,
      to_member_id: entity.toMemberId as string,
      amount_minor: entity.amountMinor,
      currency_code: entity.currencyCode as string,
      method: entity.method,
      settlement_date: entity.settlementDate as string,
      note: entity.note ?? null,
      reverses_settlement_id: entity.reversesSettlementId ? (entity.reversesSettlementId as string) : null,
      reversal_of_settlement_id: entity.reversalOfSettlementId
        ? (entity.reversalOfSettlementId as string)
        : null,
      created_by: entity.createdBy as string,
      created_at: entity.createdAt as string,
      updated_at: entity.updatedAt as string,
      deleted_at: entity.deletedAt ? (entity.deletedAt as string) : null,
      version: entity.version as number,
      last_modified_by: null,
      client_created_at: entity.createdAt as string,
      client_updated_at: entity.updatedAt as string,
      // Phase 6 Track 1 additions — round-trip nullable fields
      status: entity.status ?? null,
      confirmed_by_member_id: entity.confirmedByMemberId
        ? (entity.confirmedByMemberId as string)
        : null,
      confirmed_at: entity.confirmedAt ? (entity.confirmedAt as string) : null,
      payment_reference_hash: entity.paymentReferenceHash ?? null,
      operation_id: entity.operationId ?? null,
      evidence_hash: entity.evidenceHash ?? null,
      dispute_reason: entity.disputeReason ?? null,
      dispute_note: entity.disputeNote ?? null,
    };
  },
};

// ---------------------------------------------------------------------------
// Receipt (without items — items are mapped separately)
// ---------------------------------------------------------------------------

export interface ReceiptRow {
  readonly id: string;
  readonly group_id: string;
  readonly source: string;
  readonly merchant_name: string | null;
  readonly currency_code: string | null;
  readonly total_amount_minor: number | null;
  readonly subtotal_amount_minor: number | null;
  readonly tax_amount_minor: number | null;
  readonly receipt_date: string | null;
  readonly image_uri: string | null;
  readonly image_hash: string | null;
  readonly storage_mode: string;
  readonly retain_raw_text: boolean;
  readonly retain_source_image: boolean;
  readonly retention_days: number | null;
  readonly uploaded_by: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
  readonly version: number;
  readonly last_modified_by: string | null;
  readonly client_created_at: string;
  readonly client_updated_at: string;
}

export const ReceiptMapper = {
  toEntity(row: ReceiptRow): Receipt {
    return {
      id: asReceiptId(row.id),
      groupId: asGroupId(row.group_id) as GroupId,
      source: row.source as Receipt['source'],
      ...(row.merchant_name !== null ? { merchantName: row.merchant_name } : {}),
      ...(row.currency_code !== null
        ? { currencyCode: asCurrencyCode(row.currency_code) as CurrencyCode }
        : {}),
      ...(row.total_amount_minor !== null ? { totalAmountMinor: row.total_amount_minor } : {}),
      ...(row.subtotal_amount_minor !== null
        ? { subtotalAmountMinor: row.subtotal_amount_minor }
        : {}),
      ...(row.tax_amount_minor !== null ? { taxAmountMinor: row.tax_amount_minor } : {}),
      ...(row.receipt_date !== null ? { receiptDate: asDateTime(row.receipt_date) as DateTime } : {}),
      ...(row.image_uri !== null ? { imageUri: row.image_uri } : {}),
      ...(row.image_hash !== null ? { imageHash: row.image_hash } : {}),
      privacy: {
        storageMode: row.storage_mode as Receipt['privacy']['storageMode'],
        retainRawText: row.retain_raw_text,
        retainSourceImage: row.retain_source_image,
        ...(row.retention_days !== null ? { retentionDays: row.retention_days } : {}),
      },
      uploadedBy: asUserId(row.uploaded_by) as UserId,
      createdAt: asDateTime(row.created_at) as DateTime,
      updatedAt: asDateTime(row.updated_at) as DateTime,
      ...(row.deleted_at !== null ? { deletedAt: asDateTime(row.deleted_at) as DateTime } : {}),
      version: asVersionNumber(row.version) as VersionNumber,
    };
  },

  toRow(entity: Receipt): ReceiptRow {
    return {
      id: entity.id as string,
      group_id: entity.groupId as string,
      source: entity.source,
      merchant_name: entity.merchantName ?? null,
      currency_code: entity.currencyCode ? (entity.currencyCode as string) : null,
      total_amount_minor: entity.totalAmountMinor ?? null,
      subtotal_amount_minor: entity.subtotalAmountMinor ?? null,
      tax_amount_minor: entity.taxAmountMinor ?? null,
      receipt_date: entity.receiptDate ? (entity.receiptDate as string) : null,
      image_uri: entity.imageUri ?? null,
      image_hash: entity.imageHash ?? null,
      storage_mode: entity.privacy.storageMode,
      retain_raw_text: entity.privacy.retainRawText,
      retain_source_image: entity.privacy.retainSourceImage,
      retention_days: entity.privacy.retentionDays ?? null,
      uploaded_by: entity.uploadedBy as string,
      created_at: entity.createdAt as string,
      updated_at: entity.updatedAt as string,
      deleted_at: entity.deletedAt ? (entity.deletedAt as string) : null,
      version: entity.version as number,
      last_modified_by: null,
      client_created_at: entity.createdAt as string,
      client_updated_at: entity.updatedAt as string,
    };
  },
};

// ---------------------------------------------------------------------------
// ReceiptItem — assigned_member_ids is JSONB (TEXT in SQLite)
// ---------------------------------------------------------------------------

export interface ReceiptItemRow {
  readonly id: string;
  readonly receipt_id: string;
  readonly name: string;
  readonly quantity: number;
  readonly unit_price_minor: number;
  readonly discount_minor: number | null;
  readonly tax_minor: number | null;
  readonly total_amount_minor: number;
  /** JSONB in Postgres / TEXT in SQLite — a JSON-encoded array of MemberId strings. */
  readonly assigned_member_ids: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
  readonly version: number;
  readonly created_by: string | null;
  readonly last_modified_by: string | null;
  readonly client_created_at: string;
  readonly client_updated_at: string;
}

export const ReceiptItemMapper = {
  toEntity(row: ReceiptItemRow): ReceiptItem {
    const assignedRaw = JSON.parse(row.assigned_member_ids ?? '[]') as readonly unknown[];
    const assignedMemberIds: readonly MemberId[] = assignedRaw.map((m) =>
      asMemberId(String(m)),
    );
    return {
      id: asReceiptItemId(row.id),
      receiptId: asReceiptId(row.receipt_id),
      name: row.name,
      quantity: row.quantity,
      unitPriceMinor: row.unit_price_minor,
      ...(row.discount_minor !== null ? { discountMinor: row.discount_minor } : {}),
      ...(row.tax_minor !== null ? { taxMinor: row.tax_minor } : {}),
      totalAmountMinor: row.total_amount_minor,
      assignedMemberIds,
      createdAt: asDateTime(row.created_at) as DateTime,
      updatedAt: asDateTime(row.updated_at) as DateTime,
      ...(row.deleted_at !== null ? { deletedAt: asDateTime(row.deleted_at) as DateTime } : {}),
      version: asVersionNumber(row.version) as VersionNumber,
    };
  },

  toRow(entity: ReceiptItem): ReceiptItemRow {
    return {
      id: entity.id as string,
      receipt_id: entity.receiptId as string,
      name: entity.name,
      quantity: entity.quantity,
      unit_price_minor: entity.unitPriceMinor,
      discount_minor: entity.discountMinor ?? null,
      tax_minor: entity.taxMinor ?? null,
      total_amount_minor: entity.totalAmountMinor,
      assigned_member_ids: JSON.stringify(entity.assignedMemberIds as readonly string[]),
      created_at: entity.createdAt as string,
      updated_at: entity.updatedAt as string,
      deleted_at: entity.deletedAt ? (entity.deletedAt as string) : null,
      version: entity.version as number,
      created_by: null,
      last_modified_by: null,
      client_created_at: entity.createdAt as string,
      client_updated_at: entity.updatedAt as string,
    };
  },
};

// ---------------------------------------------------------------------------
// GroupInvite
// ---------------------------------------------------------------------------

export interface GroupInviteRow {
  readonly id: string;
  readonly group_id: string;
  readonly token: string;
  readonly token_hash: string;
  readonly inviter_member_id: string;
  readonly invitee_display_name: string | null;
  readonly invitee_email: string | null;
  readonly status: 'pending' | 'accepted' | 'revoked' | 'expired';
  readonly intended_role: 'member' | 'admin';
  readonly max_uses: number;
  readonly use_count: number;
  readonly expires_at: string;
  readonly accepted_by_member_id: string | null;
  readonly accepted_at: string | null;
  readonly revoked_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
  readonly version: number;
  readonly created_by: string | null;
  readonly last_modified_by: string | null;
  readonly client_created_at: string;
  readonly client_updated_at: string;
}

export const GroupInviteMapper = {
  toEntity(row: GroupInviteRow): GroupInvite {
    return {
      id: asInviteId(row.id),
      groupId: asGroupId(row.group_id) as GroupId,
      token: asInviteToken(row.token),
      tokenHash: row.token_hash,
      inviterMemberId: asMemberId(row.inviter_member_id) as MemberId,
      ...(row.invitee_display_name !== null ? { inviteeDisplayName: row.invitee_display_name } : {}),
      ...(row.invitee_email !== null ? { inviteeEmail: row.invitee_email } : {}),
      status: row.status,
      intendedRole: row.intended_role,
      maxUses: row.max_uses,
      useCount: row.use_count,
      expiresAt: asDateTime(row.expires_at) as DateTime,
      ...(row.accepted_by_member_id !== null
        ? { acceptedByMemberId: asMemberId(row.accepted_by_member_id) as MemberId }
        : {}),
      ...(row.accepted_at !== null ? { acceptedAt: asDateTime(row.accepted_at) as DateTime } : {}),
      ...(row.revoked_at !== null ? { revokedAt: asDateTime(row.revoked_at) as DateTime } : {}),
      createdAt: asDateTime(row.created_at) as DateTime,
      version: asVersionNumber(row.version) as VersionNumber,
    };
  },

  toRow(entity: GroupInvite): GroupInviteRow {
    return {
      id: entity.id as string,
      group_id: entity.groupId as string,
      token: entity.token as string,
      token_hash: entity.tokenHash,
      inviter_member_id: entity.inviterMemberId as string,
      invitee_display_name: entity.inviteeDisplayName ?? null,
      invitee_email: entity.inviteeEmail ?? null,
      status: entity.status,
      intended_role: entity.intendedRole,
      max_uses: entity.maxUses ?? 1,
      use_count: entity.useCount,
      expires_at: entity.expiresAt as string,
      accepted_by_member_id: entity.acceptedByMemberId ? (entity.acceptedByMemberId as string) : null,
      accepted_at: entity.acceptedAt ? (entity.acceptedAt as string) : null,
      revoked_at: entity.revokedAt ? (entity.revokedAt as string) : null,
      created_at: entity.createdAt as string,
      updated_at: entity.createdAt as string,
      deleted_at: null,
      version: entity.version as number,
      created_by: null,
      last_modified_by: null,
      client_created_at: entity.createdAt as string,
      client_updated_at: entity.createdAt as string,
    };
  },
};

// ---------------------------------------------------------------------------
// GuestIdentity
// ---------------------------------------------------------------------------

export interface GuestIdentityRow {
  readonly id: string;
  readonly profile_id: string | null;
  readonly guest_identity_id: string;
  readonly guest_display_name: string;
  readonly device_secret_hash: string;
  readonly upgrade_status: 'local_only' | 'upgrade_pending' | 'upgrade_in_progress' | 'upgraded' | 'upgrade_failed';
  readonly linked_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
  readonly version: number;
  readonly created_by: string | null;
  readonly last_modified_by: string | null;
  readonly client_created_at: string;
  readonly client_updated_at: string;
}

export const GuestIdentityMapper = {
  toEntity(row: GuestIdentityRow): GuestIdentity {
    return {
      id: asGuestIdentityId(row.guest_identity_id),
      displayName: asDisplayName(row.guest_display_name) as DisplayName,
      deviceSecretHash: row.device_secret_hash,
      upgradeStatus: row.upgrade_status,
      ...(row.profile_id !== null ? { linkedUserId: asUserId(row.profile_id) as UserId } : {}),
      createdAt: asDateTime(row.created_at) as DateTime,
      updatedAt: asDateTime(row.updated_at) as DateTime,
      version: asVersionNumber(row.version) as VersionNumber,
    };
  },

  toRow(entity: GuestIdentity): GuestIdentityRow {
    return {
      id: entity.id as string,
      profile_id: entity.linkedUserId ? (entity.linkedUserId as string) : null,
      guest_identity_id: entity.id as string,
      guest_display_name: entity.displayName as string,
      device_secret_hash: entity.deviceSecretHash,
      upgrade_status: entity.upgradeStatus,
      linked_at: entity.linkedUserId ? (entity.updatedAt as string) : null,
      created_at: entity.createdAt as string,
      updated_at: entity.updatedAt as string,
      deleted_at: null,
      version: entity.version as number,
      created_by: null,
      last_modified_by: null,
      client_created_at: entity.createdAt as string,
      client_updated_at: entity.updatedAt as string,
    };
  },
};

// ---------------------------------------------------------------------------
// AuditLog
// ---------------------------------------------------------------------------

export interface AuditLogRow {
  readonly id: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly action: 'create' | 'update' | 'delete' | 'restore' | 'sync';
  readonly actor_id: string | null;
  readonly group_id: string | null;
  readonly previous_version: number | null;
  readonly new_version: number | null;
  /** JSONB in Postgres / TEXT in SQLite — a JSON-encoded object. */
  readonly change_summary: string | null;
  readonly created_at: string;
}

export const AuditLogMapper = {
  toEntity(row: AuditLogRow): AuditLogEntry {
    const changeSummary =
      row.change_summary !== null
        ? (JSON.parse(row.change_summary) as Readonly<Record<string, unknown>>)
        : undefined;
    return {
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      action: row.action,
      ...(row.actor_id !== null ? { actorId: asUserId(row.actor_id) as UserId } : {}),
      ...(row.group_id !== null ? { groupId: asGroupId(row.group_id) as GroupId } : {}),
      ...(row.previous_version !== null ? { previousVersion: row.previous_version } : {}),
      ...(row.new_version !== null ? { newVersion: row.new_version } : {}),
      ...(changeSummary !== undefined ? { changeSummary } : {}),
      createdAt: asDateTime(row.created_at) as DateTime,
    };
  },

  toRow(entity: Omit<AuditLogEntry, 'createdAt'> & { readonly createdAt?: DateTime }): AuditLogRow {
    const createdAt = (entity.createdAt ?? asDateTime('1970-01-01T00:00:00.000Z')) as string;
    return {
      id: entity.id,
      entity_type: entity.entityType,
      entity_id: entity.entityId,
      action: entity.action,
      actor_id: entity.actorId ? (entity.actorId as string) : null,
      group_id: entity.groupId ? (entity.groupId as string) : null,
      previous_version: entity.previousVersion ?? null,
      new_version: entity.newVersion ?? null,
      change_summary: entity.changeSummary !== undefined ? JSON.stringify(entity.changeSummary) : null,
      created_at: createdAt,
    };
  },
};

// ---------------------------------------------------------------------------
// SyncOperation — payload is JSON
// ---------------------------------------------------------------------------

export interface SyncOperationRow {
  readonly id: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly operation: string;
  /** JSONB in Postgres / TEXT in SQLite — a JSON-encoded object. */
  readonly payload: string;
  readonly idempotency_key: string;
  readonly base_version: number;
  readonly local_version: number;
  readonly status: string;
  readonly retry_count: number;
  readonly last_error_code: string | null;
  readonly last_error_message: string | null;
  readonly created_at: string;
  readonly last_attempted_at: string | null;
  readonly next_retry_at: string | null;
}

export const SyncOperationMapper = {
  toEntity(row: SyncOperationRow): SyncOperation {
    const payload = JSON.parse(row.payload ?? '{}') as Readonly<Record<string, unknown>>;
    return {
      id: row.id,
      entityType: row.entity_type as SyncOperation['entityType'],
      entityId: row.entity_id,
      operation: row.operation as SyncOperation['operation'],
      payload,
      idempotencyKey: row.idempotency_key,
      baseVersion: row.base_version,
      localVersion: row.local_version,
      status: row.status as SyncOperation['status'],
      retryCount: row.retry_count,
      ...(row.last_error_code !== null ? { lastErrorCode: row.last_error_code } : {}),
      ...(row.last_error_message !== null ? { lastErrorMessage: row.last_error_message } : {}),
      createdAt: asDateTime(row.created_at) as DateTime,
      ...(row.last_attempted_at !== null
        ? { lastAttemptedAt: asDateTime(row.last_attempted_at) as DateTime }
        : {}),
      ...(row.next_retry_at !== null ? { nextRetryAt: asDateTime(row.next_retry_at) as DateTime } : {}),
    };
  },

  toRow(entity: SyncOperation): SyncOperationRow {
    return {
      id: entity.id,
      entity_type: entity.entityType,
      entity_id: entity.entityId,
      operation: entity.operation,
      payload: JSON.stringify(entity.payload),
      idempotency_key: entity.idempotencyKey,
      base_version: entity.baseVersion,
      local_version: entity.localVersion,
      status: entity.status,
      retry_count: entity.retryCount,
      last_error_code: entity.lastErrorCode ?? null,
      last_error_message: entity.lastErrorMessage ?? null,
      created_at: entity.createdAt as string,
      last_attempted_at: entity.lastAttemptedAt ? (entity.lastAttemptedAt as string) : null,
      next_retry_at: entity.nextRetryAt ? (entity.nextRetryAt as string) : null,
    };
  },
};
