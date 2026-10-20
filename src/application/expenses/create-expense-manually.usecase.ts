import {
  asExpenseId,
  asExpensePayerId,
  asExpenseSplitId,
  asGroupId,
  asMemberId,
  createExpense,
  createExpensePayer,
  createExpenseSplit,
  validateExpenseAggregate,
} from '@domain/entities';
import { InvalidEntityError } from '@domain/errors';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { ExpenseRepository } from '@domain/repositories/expense.repository';
import type { GroupMemberRepository } from '@domain/repositories/group-member.repository';
import type { GroupRepository } from '@domain/repositories/group.repository';
import { calculateEqualSplit } from '@domain/services/splits';
import { Money } from '@domain/value-objects';
import type { DateTime } from '@domain/value-objects';

// ---------------------------------------------------------------------------
// Use case input / output
// ---------------------------------------------------------------------------

/**
 * One payer contribution. The DOMAIN supports multiple payers (sum of
 * contributions MUST equal the expense total — enforced by
 * `validateExpenseAggregate`); the manual form currently sends a single
 * contribution covering the full amount, but the use case accepts any
 * valid combination so multi-payer UI arrives without rework.
 */
export interface ManualPayerContribution {
  readonly memberId: string;
  readonly amountMinor: number;
}

export interface CreateExpenseManuallyInput {
  readonly groupId: string;
  readonly title: string;
  /** Integer minor units (e.g. cents / paise). */
  readonly amountMinor: number;
  readonly currencyCode: string;
  /** Date-only ("YYYY-MM-DD") or full ISO date-time. Defaults to now. */
  readonly expenseDate?: string;
  readonly note?: string;
  readonly payerContributions: readonly ManualPayerContribution[];
  /** Participants who owe a share. Must be non-empty. */
  readonly participantIds: readonly string[];
  readonly createdBy: string;
  /**
   * Client-generated expense id. When the SAME id is retried after a
   * failure, `save()`'s upsert semantics make the retry idempotent —
   * no duplicate expense is created.
   */
  readonly expenseId?: string;
  readonly now?: DateTime;
}

export interface CreateExpenseManuallyOutput {
  readonly expenseId: string;
  readonly groupId: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
  /** The persisted per-participant shares (deterministic equal split). */
  readonly splits: readonly { readonly memberId: string; readonly amountMinor: number }[];
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

/**
 * Use case: Create an expense WITHOUT a capture draft — the manual form
 * path (`/expenses/new`).
 *
 * This is the manual sibling of `CreateExpenseFromDraftUseCase`: the
 * capture pipeline requires user review of OCR output before an expense
 * exists, but a user who simply typed the values has already supplied
 * the ground truth — there is nothing to review, so the draft stage is
 * skipped entirely (the draft state machine starts at `capturing`,
 * which is unreachable without an image).
 *
 * Steps:
 *   1. Load the group (must exist and not be deleted).
 *   2. Load the group's ACTIVE members and validate that every payer
 *      and participant is among them.
 *   3. Validate the payer contributions sum to the expense total
 *      (single- or multi-payer).
 *   4. Compute the equal split with the DOMAIN split engine
 *      (`calculateEqualSplit`) — deterministic remainder distribution
 *      (1000 minor / 3 participants → [334, 333, 333]), so every device
 *      computes the identical split for the same input.
 *   5. Build the expense + payers + splits entities and validate the
 *      full aggregate (`validateExpenseAggregate` — payer total =
 *      expense total, split total = expense total, no duplicate members).
 *   6. Persist atomically via `ExpenseRepository.save()` — the expense,
 *      its payers, its splits, AND the offline-sync operation are
 *      written in ONE transaction.
 *   7. Append the audit-log entry.
 *
 * If any step throws, nothing is persisted (the repository's transaction
 * guarantees atomicity).
 */
export class CreateExpenseManuallyUseCase {
  constructor(
    private readonly groups: GroupRepository,
    private readonly members: GroupMemberRepository,
    private readonly expenses: ExpenseRepository,
    private readonly audit: AuditRepository,
  ) {}

  async execute(input: CreateExpenseManuallyInput): Promise<CreateExpenseManuallyOutput> {
    // 1. Group must exist and be active.
    const group = await this.groups.findById(asGroupId(input.groupId));
    if (group === null) {
      throw new InvalidEntityError(`Group ${input.groupId} not found`);
    }
    if (group.deletedAt !== undefined) {
      throw new InvalidEntityError(`Group ${input.groupId} is deleted`);
    }

    // 2. Payers and participants must be ACTIVE members of the group.
    const activeMembers = await this.members.listActiveByGroup(asGroupId(input.groupId));
    const activeIds = new Set(activeMembers.map((m) => m.id as string));
    if (activeIds.size === 0) {
      throw new InvalidEntityError(`Group ${input.groupId} has no active members`);
    }

    for (const payer of input.payerContributions) {
      if (!activeIds.has(payer.memberId)) {
        throw new InvalidEntityError(
          `Payer ${payer.memberId} is not an active member of group ${input.groupId}`,
        );
      }
    }
    if (input.payerContributions.length === 0) {
      throw new InvalidEntityError('At least one payer contribution is required');
    }
    if (input.participantIds.length === 0) {
      throw new InvalidEntityError('At least one participant is required');
    }
    const seenParticipants = new Set<string>();
    for (const participantId of input.participantIds) {
      if (!activeIds.has(participantId)) {
        throw new InvalidEntityError(
          `Participant ${participantId} is not an active member of group ${input.groupId}`,
        );
      }
      if (seenParticipants.has(participantId)) {
        throw new InvalidEntityError(`Duplicate participant: ${participantId}`);
      }
      seenParticipants.add(participantId);
    }

    // 3. Payer total must equal the expense total.
    const payerTotal = input.payerContributions.reduce((acc, p) => acc + p.amountMinor, 0);
    if (payerTotal !== input.amountMinor) {
      throw new InvalidEntityError(
        `Payer contributions (${payerTotal}) must equal the expense total (${input.amountMinor})`,
      );
    }

    // 4. Equal split via the domain split engine (deterministic remainder).
    const total = Money.fromMinor(input.amountMinor, input.currencyCode);
    const splitResult = calculateEqualSplit(total, input.participantIds.map(asMemberId));

    // 5. Build + validate the aggregate.
    const now = input.now ?? (new Date().toISOString() as DateTime);
    const expenseId = asExpenseId(input.expenseId ?? generateId());
    const expense = createExpense({
      id: expenseId,
      groupId: asGroupId(input.groupId),
      title: input.title,
      amountMinor: input.amountMinor,
      currencyCode: input.currencyCode,
      expenseDate: normalizeExpenseDate(input.expenseDate, now),
      splitType: 'equal',
      ...(input.note !== undefined ? { note: input.note } : {}),
      createdBy: input.createdBy as never,
      now,
    });

    const payers = input.payerContributions.map((payer) =>
      createExpensePayer({
        id: asExpensePayerId(generateId()),
        expenseId,
        memberId: asMemberId(payer.memberId),
        amountMinor: payer.amountMinor,
        now,
      }),
    );

    const splits = splitResult.entries.map((entry) =>
      createExpenseSplit({
        id: asExpenseSplitId(generateId()),
        expenseId,
        memberId: entry.memberId,
        amountMinor: entry.amountMinor,
        now,
      }),
    );

    // 5. Build + validate the aggregate.
    //    v2.5.0: the GROUP-CURRENCY invariant is enforced here — the
    //    aggregate validator supports it but the write path never passed
    //    it, so a stray-currency expense was accepted and later crashed
    //    the single-currency balance engine (BalanceValidationError).
    validateExpenseAggregate(
        expense,
        payers,
        splits,
        group.currencyCode as unknown as Parameters<typeof validateExpenseAggregate>[3],
      );

    // 6. Atomic persist (expense + payers + splits + sync op in ONE tx).
    await this.expenses.save(expense, payers, splits);

    // 7. Audit trail.
    await this.audit.append({
      id: generateId(),
      entityType: 'expense',
      entityId: expenseId as string,
      action: 'create',
      actorId: input.createdBy as never,
      groupId: asGroupId(input.groupId),
      newVersion: expense.version as number,
      changeSummary: {
        source: 'manual_form',
        amountMinor: input.amountMinor,
        currencyCode: input.currencyCode,
        splitType: 'equal',
        payerCount: payers.length,
        participantCount: splits.length,
      },
    });

    return {
      expenseId: expenseId as string,
      groupId: input.groupId,
      amountMinor: input.amountMinor,
      currencyCode: input.currencyCode,
      splits: splits.map((s) => ({
        memberId: s.memberId as string,
        amountMinor: s.amountMinor,
      })),
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Normalize the form's date input into a full ISO date-time. Mirrors the
 * draft-path normalizer: undefined → now; date-only → midnight UTC; full
 * ISO → validated as-is.
 */
function normalizeExpenseDate(expenseDate: string | undefined, now: string): string {
  if (expenseDate === undefined || expenseDate.trim().length === 0) {
    return now;
  }
  const trimmed = expenseDate.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(trimmed)) {
    return trimmed;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00.000Z`;
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) {
    throw new InvalidEntityError(`Expense date is not parseable: "${expenseDate}"`);
  }
  return new Date(ms).toISOString();
}
