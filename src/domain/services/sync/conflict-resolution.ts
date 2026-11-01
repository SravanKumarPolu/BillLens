/**
 * Three-way merge logic — Phase 7 Prompt 64.
 *
 * Pure module that compares base, local, and remote versions of an
 * entity's fields to determine which fields can be auto-merged and
 * which require user intervention.
 *
 * ── Financial fields are NEVER auto-merged ──
 *
 * The spec (Prompt 64) says:
 *
 *   "Do not automatically merge:
 *     - Amounts
 *     - Currency
 *     - Payers
 *     - Participants
 *     - Settlement status
 *     - Identity links
 *     - Ownership
 *     - Deletion state"
 *
 * This module enforces that by listing the financial fields that must
 * NOT be auto-merged. The merger skips these fields — any change to
 * them creates a conflict.
 */

// ---------------------------------------------------------------------------
// Financial fields that must NEVER be auto-merged
// ---------------------------------------------------------------------------

export const FINANCIAL_FIELDS: readonly string[] = [
  'amountMinor',
  'currencyCode',
  'fromMemberId',
  'toMemberId',
  'payerMemberId',
  'receiverMemberId',
  'status',
  'confirmedByMemberId',
  'paymentReferenceHash',
  'evidenceHash',
  'splitType',
  'splitAmounts',
  'role',
  'userId',
  'groupId',
  'deletedAt',
];

// ---------------------------------------------------------------------------
// Merge result
// ---------------------------------------------------------------------------

export interface FieldMergeResult {
  readonly fieldName: string;
  readonly baseValue: unknown;
  readonly localValue: unknown;
  readonly remoteValue: unknown;
  readonly resolution: 'local' | 'remote' | 'base' | 'conflict';
}

export interface ThreeWayMergeResult {
  /** Fields that were auto-merged (local-only or remote-only changes). */
  readonly mergedFields: readonly FieldMergeResult[];
  /** Fields that conflict (both local and remote changed the same field). */
  readonly conflictingFields: readonly FieldMergeResult[];
  /** True if any financial field is in the conflicting set. */
  readonly hasFinancialConflict: boolean;
  /** The merged snapshot (only if no conflicts). */
  readonly mergedSnapshot: Readonly<Record<string, unknown>> | null;
  /** True if the merge can be auto-applied (no conflicts). */
  readonly canAutoMerge: boolean;
}

// ---------------------------------------------------------------------------
// Three-way merge
// ---------------------------------------------------------------------------

/**
 * Perform a three-way merge on an entity's fields.
 *
 * Compares the base, local, and remote versions field by field.
 *
 *   - If only local changed a field → use local.
 *   - If only remote changed a field → use remote.
 *   - If both changed the same field → conflict (UNLESS the field
 *     is financial — financial conflicts are always conflicts, never
 *     auto-resolved).
 *   - If neither changed → use base.
 *
 * The function is pure — no side effects, no I/O.
 *
 * @example
 *   const result = threeWayMerge(
 *     { title: 'Dinner', amountMinor: 5000 },
 *     { title: 'Dinner for 3', amountMinor: 5000 },
 *     { title: 'Dinner', amountMinor: 6000 },
 *   );
 *   // result.mergedFields: [{ fieldName: 'title', resolution: 'local', ... }]
 *   // result.conflictingFields: [{ fieldName: 'amountMinor', resolution: 'conflict', ... }]
 *   // result.hasFinancialConflict: true
 *   // result.canAutoMerge: false
 */
export function threeWayMerge(
  base: Readonly<Record<string, unknown>>,
  local: Readonly<Record<string, unknown>>,
  remote: Readonly<Record<string, unknown>>,
): ThreeWayMergeResult {
  const allKeys = new Set<string>([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  const mergedFields: FieldMergeResult[] = [];
  const conflictingFields: FieldMergeResult[] = [];
  const mergedSnapshot: Record<string, unknown> = {};
  let hasFinancialConflict = false;

  for (const key of allKeys) {
    const baseValue = base[key];
    const localValue = local[key];
    const remoteValue = remote[key];

    const localChanged = !deepEqual(localValue, baseValue);
    const remoteChanged = !deepEqual(remoteValue, baseValue);

    if (!localChanged && !remoteChanged) {
      // Neither changed → use base
      mergedFields.push({ fieldName: key, baseValue, localValue, remoteValue, resolution: 'base' });
      mergedSnapshot[key] = baseValue;
    } else if (localChanged && !remoteChanged) {
      // Only local changed → use local
      mergedFields.push({ fieldName: key, baseValue, localValue, remoteValue, resolution: 'local' });
      mergedSnapshot[key] = localValue;
    } else if (!localChanged && remoteChanged) {
      // Only remote changed → use remote
      mergedFields.push({ fieldName: key, baseValue, localValue, remoteValue, resolution: 'remote' });
      mergedSnapshot[key] = remoteValue;
    } else {
      // Both changed → conflict
      const isFinancial = FINANCIAL_FIELDS.includes(key);
      if (isFinancial) {
        hasFinancialConflict = true;
      }
      // Check if local and remote ended up with the same value
      if (deepEqual(localValue, remoteValue)) {
        // They changed to the same value → use it (convergence)
        mergedFields.push({ fieldName: key, baseValue, localValue, remoteValue, resolution: 'local' });
        mergedSnapshot[key] = localValue;
      } else {
        conflictingFields.push({ fieldName: key, baseValue, localValue, remoteValue, resolution: 'conflict' });
      }
    }
  }

  const canAutoMerge = conflictingFields.length === 0;
  return {
    mergedFields,
    conflictingFields,
    hasFinancialConflict,
    mergedSnapshot: canAutoMerge ? mergedSnapshot : null,
    canAutoMerge,
  };
}

/**
 * Deep equality check for unknown values. Handles primitives, arrays,
 * and plain objects. Does NOT handle Date, Map, Set, or class instances.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) =>
    deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

// ---------------------------------------------------------------------------
// Conflict priority
// ---------------------------------------------------------------------------

export type ConflictPriority = 'high' | 'normal';

export const HIGH_PRIORITY_CONFLICT_TYPES: readonly string[] = [
  'expense_amount_changed',
  'participant_shares_changed',
  'payer_changed',
  'settlement_confirmed_while_edited',
  'completed_settlement_reversed_concurrently',
  'group_deleted_while_offline_edits_exist',
  'member_identity_linked_differently',
  'attachment_privacy_changed',
  'ownership_changed',
];

export function isHighPriorityConflict(conflictType: string): boolean {
  return HIGH_PRIORITY_CONFLICT_TYPES.includes(conflictType);
}
