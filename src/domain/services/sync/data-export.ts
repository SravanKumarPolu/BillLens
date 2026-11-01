/**
 * Data export and backup format — Phase 7 Prompts 68-69.
 *
 * Defines the CSV export format, the JSON backup schema, and the
 * restore pipeline types.
 *
 * All functions are PURE — no I/O. The concrete export/restore
 * use cases wrap these formatters.
 */

import type { DateTime } from '@domain/value-objects/date-time';

// ---------------------------------------------------------------------------
// CSV export (spec, Prompt 68)
// ---------------------------------------------------------------------------

/**
 * CSV escape a single field value.
 *
 * Wraps in double quotes if the value contains commas, double quotes,
 * or line breaks. Escapes embedded double quotes by doubling them.
 */
export function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Build a CSV row from an array of values.
 */
export function csvRow(values: readonly (string | number | null | undefined)[]): string {
  return values.map(csvEscape).join(',');
}

/**
 * Build a CSV file from headers and rows.
 */
export function buildCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string {
  const lines = [csvRow(headers)];
  for (const row of rows) {
    lines.push(csvRow(row));
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// JSON backup schema (spec, Prompt 68)
// ---------------------------------------------------------------------------

export const BACKUP_SCHEMA_VERSION = 1;

export interface BackupFile {
  readonly schemaVersion: number;
  readonly exportVersion: number;
  readonly appVersion: string;
  readonly generatedAt: DateTime;
  readonly groups: BackupGroup[];
  readonly settlements: BackupSettlement[];
  readonly auditReferences: BackupAuditReference[];
}

export interface BackupGroup {
  readonly id: string;
  readonly name: string;
  readonly currencyCode: string;
  readonly members: readonly BackupMember[];
  readonly expenses: BackupExpense[];
}

export interface BackupMember {
  readonly id: string;
  readonly displayName: string;
  readonly role: string;
  readonly joinedAt: DateTime;
  readonly leftAt?: DateTime;
}

export interface BackupExpense {
  readonly id: string;
  readonly title: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
  readonly expenseDate: DateTime;
  readonly splitType: string;
  readonly payers: readonly { readonly memberId: string; readonly amountMinor: number }[];
  readonly splits: readonly { readonly memberId: string; readonly amountMinor: number }[];
  readonly version: number;
  readonly createdAt: DateTime;
  readonly updatedAt: DateTime;
  readonly deletedAt?: DateTime;
}

export interface BackupSettlement {
  readonly id: string;
  readonly groupId: string;
  readonly fromMemberId: string;
  readonly toMemberId: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
  readonly method: string;
  readonly status?: string;
  readonly settlementDate: DateTime;
  readonly version: number;
  readonly createdAt: DateTime;
  readonly updatedAt: DateTime;
  readonly deletedAt?: DateTime;
  readonly reversalOfSettlementId?: string;
  readonly reversesSettlementId?: string;
}

export interface BackupAuditReference {
  readonly entityType: string;
  readonly entityId: string;
  readonly action: string;
  readonly createdAt: DateTime;
}

// ---------------------------------------------------------------------------
// Restore pipeline (spec, Prompt 69)
// ---------------------------------------------------------------------------

export type RestoreMode = 'empty_profile' | 'merge' | 'separate_local_copy';

export interface RestoreSummary {
  readonly totalGroups: number;
  readonly totalMembers: number;
  readonly totalExpenses: number;
  readonly totalSettlements: number;
  readonly totalAuditReferences: number;
  readonly duplicatesDetected: number;
  readonly conflictsDetected: number;
  readonly schemaVersion: number;
}

export interface RestoreResult {
  readonly mode: RestoreMode;
  readonly importedGroups: number;
  readonly importedMembers: number;
  readonly importedExpenses: number;
  readonly importedSettlements: number;
  readonly skippedDuplicates: number;
  readonly skippedConflicts: number;
  readonly invariantFailures: readonly string[];
}

/**
 * Validate a backup file's schema version.
 *
 * Returns true if the backup's schema version is supported by the
 * current app version. The spec says: "Do not ignore schema
 * incompatibility."
 */
export function isBackupSchemaSupported(backup: BackupFile): boolean {
  return backup.schemaVersion === BACKUP_SCHEMA_VERSION;
}

/**
 * Generate a restore summary from a backup file.
 *
 * Used by the "show import summary" stage (spec, Prompt 69).
 */
export function generateRestoreSummary(backup: BackupFile): RestoreSummary {
  let totalMembers = 0;
  let totalExpenses = 0;
  for (const g of backup.groups) {
    totalMembers += g.members.length;
    totalExpenses += g.expenses.length;
  }
  return {
    totalGroups: backup.groups.length,
    totalMembers,
    totalExpenses,
    totalSettlements: backup.settlements.length,
    totalAuditReferences: backup.auditReferences.length,
    duplicatesDetected: 0, // filled in by the restore use case
    conflictsDetected: 0,
    schemaVersion: backup.schemaVersion,
  };
}

// ---------------------------------------------------------------------------
// Post-restore invariant verification (spec, Prompt 69)
// ---------------------------------------------------------------------------

export interface InvariantCheckResult {
  readonly name: string;
  readonly passed: boolean;
  readonly details?: string;
}

/**
 * Verify that payer contributions equal expense totals.
 */
export function verifyPayerTotals(expense: BackupExpense): InvariantCheckResult {
  const payerTotal = expense.payers.reduce((acc, p) => acc + p.amountMinor, 0);
  const expected = expense.amountMinor;
  return {
    name: 'payer_totals_equal_expense_total',
    passed: payerTotal === expected,
    details: `Payer total: ${payerTotal}, expected: ${expected}`,
  };
}

/**
 * Verify that participant shares equal expense totals.
 */
export function verifySplitTotals(expense: BackupExpense): InvariantCheckResult {
  const splitTotal = expense.splits.reduce((acc, s) => acc + s.amountMinor, 0);
  const expected = expense.amountMinor;
  return {
    name: 'split_totals_equal_expense_total',
    passed: splitTotal === expected,
    details: `Split total: ${splitTotal}, expected: ${expected}`,
  };
}

/**
 * Verify that balances sum to zero per currency.
 */
export function verifyZeroSumInvariant(
  balances: Readonly<Record<string, number>>,
): InvariantCheckResult {
  for (const [currency, total] of Object.entries(balances)) {
    if (total !== 0) {
      return {
        name: 'zero_sum_per_currency',
        passed: false,
        details: `Currency ${currency} sums to ${total}, expected 0`,
      };
    }
  }
  return { name: 'zero_sum_per_currency', passed: true };
}

/**
 * Verify that reversals neutralise their original settlements.
 */
export function verifyReversalNeutralisation(
  settlements: readonly BackupSettlement[],
): InvariantCheckResult {
  for (const s of settlements) {
    if (s.reversalOfSettlementId !== undefined) {
      const original = settlements.find((o) => o.id === s.reversalOfSettlementId);
      if (original === undefined) {
        return {
          name: 'reversal_neutralises_original',
          passed: false,
          details: `Reversal ${s.id} references missing original ${s.reversalOfSettlementId}`,
        };
      }
      if (original.amountMinor !== s.amountMinor) {
        return {
          name: 'reversal_neutralises_original',
          passed: false,
          details: `Reversal ${s.id} amount ${s.amountMinor} ≠ original ${original.id} amount ${original.amountMinor}`,
        };
      }
    }
  }
  return { name: 'reversal_neutralises_original', passed: true };
}
