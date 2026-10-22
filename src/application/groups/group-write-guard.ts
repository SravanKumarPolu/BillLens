/**
 * Single archive/deletion guard for financial mutations.
 *
 * Application use cases call this for actionable domain errors; SQLite write
 * adapters also enforce it so a future screen or use case cannot bypass it.
 */

import type { Group } from '@domain/entities/group';
import { InvalidEntityError } from '@domain/errors';

export type FinancialMutation =
  | 'expense'
  | 'settlement'
  | 'recurring'
  | 'member'
  | 'receipt';

export function assertGroupWritable(
  group: Group | null,
  mutation: FinancialMutation,
): asserts group is Group {
  if (group === null) throw new InvalidEntityError('Group not found.');
  if (group.deletedAt !== undefined) {
    throw new InvalidEntityError('This group has been deleted.');
  }
  if (group.archivedAt !== undefined) {
    throw new InvalidEntityError(
      `This group is archived and read-only: ${mutation} changes are blocked. Restore the group first.`,
    );
  }
}
