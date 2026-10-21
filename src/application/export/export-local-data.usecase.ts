/**
 * ExportLocalDataUseCase — produce a portable copy of everything the
 * device holds, without any network access.
 *
 * Two artefacts from one read:
 *   - `json` — a complete, versioned backup (groups, members, expenses,
 *     settlements). This is the restore-grade format.
 *   - `csv` — expenses in an accounting-friendly CSV, reusing
 *     `exportToFormat` from `src/domain/ecosystem/accounting-export.ts`
 *     (the existing, tested implementation — not a second CSV writer).
 *
 * Deliberately excluded: receipt/payment images, OCR raw text, session
 * tokens and any secret. The backup is financial records + names only.
 *
 * Pagination: each collection is read with a hard cap. When a cap is hit
 * the result carries `truncated: true` rather than silently exporting a
 * partial file.
 */

import { exportToFormat, type ExportInput } from '@domain/ecosystem/accounting-export';
import type { Expense } from '@domain/entities/expense';
import type { Group } from '@domain/entities/group';
import type { GroupMember } from '@domain/entities/group-member';
import type { Settlement } from '@domain/entities/settlement';
import type { ExpenseRepository } from '@domain/repositories/expense.repository';
import type { GroupMemberRepository } from '@domain/repositories/group-member.repository';
import type { GroupRepository } from '@domain/repositories/group.repository';
import type { SettlementRepository } from '@domain/repositories/settlement.repository';
import { nowDateTime } from '@domain/value-objects';

/** Hard cap per collection; exceeding it sets `truncated`. */
export const EXPORT_PAGE_LIMIT = 2_000;

export interface ExportLocalDataInput {
  /** Groups to include. Presentation passes the groups this device holds. */
  readonly groupIds: readonly string[];
}

export interface ExportedGroup {
  readonly id: string;
  readonly name: string;
  readonly currencyCode: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly members: readonly {
    readonly id: string;
    readonly displayName: string;
    readonly role: string;
    readonly joinedAt: string;
  }[];
  readonly expenses: readonly {
    readonly id: string;
    readonly title: string;
    readonly amountMinor: number;
    readonly currencyCode: string;
    readonly expenseDate: string;
    readonly category: string | null;
    readonly splitType: string;
    readonly note: string | null;
  }[];
  readonly settlements: readonly {
    readonly id: string;
    readonly fromMemberId: string;
    readonly toMemberId: string;
    readonly amountMinor: number;
    readonly currencyCode: string;
    readonly method: string;
    readonly settlementDate: string;
    readonly status: string | null;
  }[];
}

export interface LocalDataExport {
  /** Bumped when the backup shape changes. */
  readonly schemaVersion: 1;
  readonly exportedAt: string;
  readonly appVersion: string;
  readonly groups: readonly ExportedGroup[];
  readonly csv: string;
  readonly counts: {
    readonly groups: number;
    readonly members: number;
    readonly expenses: number;
    readonly settlements: number;
  };
  /** True when any collection hit EXPORT_PAGE_LIMIT. */
  readonly truncated: boolean;
  /** Pretty-printed JSON backup. */
  readonly json: string;
}

export class ExportLocalDataUseCase {
  constructor(
    private readonly groups: GroupRepository,
    private readonly members: GroupMemberRepository,
    private readonly expenses: ExpenseRepository,
    private readonly settlements: SettlementRepository,
    private readonly appVersion: string = '0.0.0',
  ) {}

  async execute(input: ExportLocalDataInput): Promise<LocalDataExport> {
    let truncated = false;
    const exportedGroups: ExportedGroup[] = [];
    const csvRows: ExportInput[] = [];

    for (const groupId of input.groupIds) {
      const group = await this.groups.findById(groupId as never);
      if (group === null || group.deletedAt !== undefined) continue;

      const memberPage = await this.members.listActiveByGroup(groupId as never);
      const expensePage = await this.expenses.listByGroup(groupId as never, {
        limit: EXPORT_PAGE_LIMIT,
      });
      const settlementPage = await this.settlements.listByGroup(groupId as never, {
        limit: EXPORT_PAGE_LIMIT,
      });

      if (expensePage.hasMore || settlementPage.hasMore) truncated = true;

      const members = memberPage.map((member) => this.toMember(member));
      const expenses = expensePage.items
        .filter((expense) => expense.deletedAt === undefined)
        .map((expense) => this.toExpense(expense));
      const settlements = settlementPage.items
        .filter((settlement) => settlement.deletedAt === undefined)
        .map((settlement) => this.toSettlement(settlement));

      exportedGroups.push({
        id: group.id,
        name: group.name,
        currencyCode: group.currencyCode,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        members,
        expenses,
        settlements,
      });

      for (const expense of expensePage.items) {
        if (expense.deletedAt !== undefined) continue;
        csvRows.push({
          date: expense.expenseDate.slice(0, 10),
          amountMinor: expense.amountMinor,
          currency: expense.currencyCode,
          title: expense.title,
          ...(expense.category !== undefined ? { category: expense.category } : {}),
        });
      }
    }

    const counts = {
      groups: exportedGroups.length,
      members: exportedGroups.reduce((sum, group) => sum + group.members.length, 0),
      expenses: exportedGroups.reduce((sum, group) => sum + group.expenses.length, 0),
      settlements: exportedGroups.reduce((sum, group) => sum + group.settlements.length, 0),
    };

    const exportedAt = nowDateTime();
    const payload = {
      schemaVersion: 1 as const,
      exportedAt,
      appVersion: this.appVersion,
      groups: exportedGroups,
    };

    return {
      ...payload,
      csv: exportToFormat(csvRows, 'csv_generic'),
      counts,
      truncated,
      json: JSON.stringify(payload, null, 2),
    };
  }

  private toMember(member: GroupMember): ExportedGroup['members'][number] {
    return {
      id: member.id,
      displayName: member.displayName,
      role: member.role,
      joinedAt: member.joinedAt,
    };
  }

  private toExpense(expense: Expense): ExportedGroup['expenses'][number] {
    return {
      id: expense.id,
      title: expense.title,
      amountMinor: expense.amountMinor,
      currencyCode: expense.currencyCode,
      expenseDate: expense.expenseDate,
      category: expense.category ?? null,
      splitType: expense.splitType,
      note: expense.note ?? null,
    };
  }

  private toSettlement(settlement: Settlement): ExportedGroup['settlements'][number] {
    return {
      id: settlement.id,
      fromMemberId: settlement.fromMemberId,
      toMemberId: settlement.toMemberId,
      amountMinor: settlement.amountMinor,
      currencyCode: settlement.currencyCode,
      method: settlement.method,
      settlementDate: settlement.settlementDate,
      status: settlement.status ?? null,
    };
  }
}

export type { Group };
