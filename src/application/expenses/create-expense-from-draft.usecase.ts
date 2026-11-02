import {
  asExpenseId,
  asReceiptId,
  createReceipt,
  createReceiptItem,
  asExpensePayerId,
  asExpenseSplitId,
  asGroupId,
  asMemberId,
  confirmExpenseDraft,
  createExpense,
  createExpensePayer,
  createExpenseSplit,
  validateExpenseAggregate,
} from '@domain/entities';
import { InvalidEntityError } from '@domain/errors';
import type { UnitOfWork } from '@domain/repositories/unit-of-work';
import { calculateItemSplit, SplitEngine } from '@domain/services/splits';
import { Money } from '@domain/value-objects';
import type { ExpenseDraftId } from '@shared-types/index';

// ---------------------------------------------------------------------------
// Use case input / output
// ---------------------------------------------------------------------------

export interface CreateExpenseFromDraftInput {
  readonly draftId: ExpenseDraftId;
  readonly groupId: string;
  /** The version the caller expects the draft to be at (optimistic concurrency). */
  readonly expectedVersion: number;
  /** Local receipt image URI; when present a Receipt row is persisted atomically. */
  readonly imageUri?: string;
}

export interface CreateExpenseFromDraftOutput {
  readonly expenseId: string;
  readonly draftStatus: string;
  readonly receiptId?: string;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

/**
 * Use case: Create a final Expense from a confirmed ExpenseDraft.
 *
 * This is the ONLY way to create an Expense from a draft. It:
 *
 *   1. Loads the draft (within the UnitOfWork transaction).
 *   2. Validates the draft is not already in a terminal status.
 *   3. Validates the draft has the required fields (amount, currency,
 *      title) — without these the expense aggregate cannot be created.
 *   4. Creates the Expense entity.
 *   5. Creates ExpensePayer records (one per `payerCandidate`, each
 *      paying the full `amountMinor` — a simplified single-payer
 *      assumption for Phase 2; multi-payer splits will arrive with the
 *      split-strategy work in Phase 3).
 *   6. Creates ExpenseSplit records (one per `participantCandidate`)
 *      using the DOMAIN equal-split engine — deterministic remainder
 *      allocation (largest-remainder by ascending member id), so
 *      ₹10.00 across 3 participants yields [334, 333, 333] and the
 *      aggregate invariant `Σ splits === total` always holds. (v2.4.0:
 *      previously a naive `Math.floor` split rejected non-divisible
 *      amounts outright — the OCR confirm flow made that defect user-
 *      visible, so the domain engine is now used here.)
 *   7. Validates the full expense aggregate (`validateExpenseAggregate`)
 *      — this enforces all financial invariants (payer total = expense
 *      total, split total = expense total, no duplicate members, etc.).
 *   8. Saves the expense + payers + splits atomically. The SQLite
 *      expense repository co-enqueues the offline-sync operation for
 *      the expense WITHIN the same transaction (v2.0.3+ architecture),
 *      so the use case no longer enqueues a second sync operation —
 *      a duplicate op would double-upload and surface as a fake
 *      server-side conflict.
 *   9. Marks the draft as `confirmed` via the domain transition
 *      function `confirmExpenseDraft` (which enforces its own
 *      optimistic-concurrency check). The offline-sync operation for the
 *      new expense is enqueued atomically by the repository layer (step 8).
 *
 * ARCHITECTURE RULE: OCR output NEVER directly creates an expense. The
 * draft MUST go through user review first (state machine:
 * `capturing → processing → needs_review → confirmed`).
 *
 * If ANY step throws, the UnitOfWork rolls back — no partial expense,
 * no orphan payers/splits, no confirmed-but-unsaved draft.
 *
 * Constructor parameters:
 *   - `uow` — the UnitOfWork that wraps the atomic write. The UoW
 *     context exposes `ctx.drafts` and `ctx.expenses` (among other
 *     repositories) so the use case can load and persist both entities
 *     within the same transaction.
 *
 *   The use case deliberately does NOT take `draftRepo` /
 *   `expenseRepo` as separate constructor parameters — all reads and
 *   writes go through the UoW context so they participate in the
 *   transaction's rollback semantics. A separate constructor-time
 *   repository would risk reading stale data outside the transaction.
 */
export class CreateExpenseFromDraftUseCase {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(
    input: CreateExpenseFromDraftInput,
  ): Promise<CreateExpenseFromDraftOutput> {
    return this.uow.execute(async (ctx) => {
      // 1. Load draft within the transaction so the version check is
      //    consistent with the eventual confirm write.
      const draft = await ctx.drafts.findById(input.draftId);
      if (!draft) {
        throw new InvalidEntityError(`Draft ${input.draftId} not found`);
      }

      // 2. Validate the draft is not in a terminal status.
      if (draft.status === 'confirmed') {
        throw new InvalidEntityError(`Draft ${input.draftId} is already confirmed`);
      }
      if (draft.status === 'discarded') {
        throw new InvalidEntityError(`Draft ${input.draftId} is discarded`);
      }

      // 3. Validate the draft has the required fields to build an expense.
      //    The Expense entity itself rejects empty titles and zero/negative
      //    amounts, but we want a clearer error message here pointing at the
      //    draft rather than at the expense factory.
      if (
        draft.amountMinor === undefined ||
        draft.currencyCode === undefined ||
        draft.title === undefined ||
        draft.title.trim().length === 0
      ) {
        throw new InvalidEntityError(
          `Draft ${input.draftId} is missing required fields (amount, currency, title)`,
        );
      }

      // 4. Create the Expense entity. `splitType = 'equal'` matches the
      //    simplified split logic below.
      //
      //    The draft's `expenseDate` may be a date-only string
      //    (YYYY-MM-DD, as the OCR pipeline produces) — `createExpense`
      //    requires a full ISO date-time, so we normalize here.
      const expenseId = asExpenseId(generateId());
      const receiptId = input.imageUri !== undefined ? asReceiptId(`receipt-${draft.id}`) : undefined;
      const chargesTotal = draft.charges.reduce((sum, charge) => sum + charge.amountMinor, 0);
      const itemsTotal = draft.lineItems.reduce((sum, item) => sum + item.totalAmountMinor, 0);
      const useItems =
        draft.lineItems.length > 0 &&
        itemsTotal + chargesTotal === draft.amountMinor &&
        draft.lineItems.every(
          (item) => item.assignedMemberIds.length > 0 && item.totalAmountMinor >= 0,
        );

      if (receiptId !== undefined) {
        const now = new Date().toISOString() as never;
        const receipt = createReceipt({
          id: receiptId,
          groupId: asGroupId(input.groupId),
          source: 'paper',
          ...(draft.merchantName !== undefined ? { merchantName: draft.merchantName } : {}),
          ...(draft.currencyCode !== undefined ? { currencyCode: draft.currencyCode } : {}),
          ...(draft.amountMinor !== undefined ? { totalAmountMinor: draft.amountMinor } : {}),
          ...(draft.expenseDate !== undefined
            ? {
                receiptDate: draft.expenseDate.includes('T')
                  ? draft.expenseDate
                  : `${draft.expenseDate}T00:00:00.000Z`,
              }
            : {}),
          imageUri: input.imageUri as string,
          uploadedBy: draft.createdBy,
          privacy: { storageMode: 'local_only', retainSourceImage: true, retainRawText: false },
          now,
        });
        const receiptItems = draft.lineItems.map((item, index) =>
          createReceiptItem({
            id: `receipt-item-${draft.id}-${index}` as never,
            receiptId,
            name: item.name,
            quantity: item.quantity,
            unitPriceMinor: item.unitPriceMinor,
            ...(item.discountMinor !== undefined ? { discountMinor: item.discountMinor } : {}),
            ...(item.taxMinor !== undefined ? { taxMinor: item.taxMinor } : {}),
            assignedMemberIds: item.assignedMemberIds,
            now,
          }),
        );
        await ctx.receipts.save(receipt, receiptItems);
      }

      const expense = createExpense({
        id: expenseId,
        groupId: asGroupId(input.groupId),
        title: draft.title,
        amountMinor: draft.amountMinor,
        currencyCode: draft.currencyCode as string,
        expenseDate: normalizeExpenseDate(draft.expenseDate),
        splitType: useItems ? 'items' : 'equal',
        ...(receiptId !== undefined ? { receiptId } : {}),
        ...(useItems
          ? {
              lineItems: draft.lineItems.map((item) => ({
                id: item.id as string,
                name: item.name,
                quantity: item.quantity,
                unitPriceMinor: item.unitPriceMinor,
                totalAmountMinor: item.totalAmountMinor,
                assignedMemberIds: item.assignedMemberIds,
                ...(item.discountMinor !== undefined ? { discountMinor: item.discountMinor } : {}),
                ...(item.taxMinor !== undefined ? { taxMinor: item.taxMinor } : {}),
              })),
              itemCharges: draft.charges.map((charge) => ({
                type: charge.type,
                amountMinor: charge.amountMinor,
                ...(charge.label !== undefined ? { label: charge.label } : {}),
              })),
            }
          : {}),
        createdBy: draft.createdBy,
      });

      // 5. Create payers. v2.5.0 FIX: every payer candidate previously
      //    received the FULL amount, so a receipt with more than one
      //    detected payer could NEVER be confirmed (validatePayerTotal
      //    rejected Σ payers > total at confirm time). Keep the first
      //    candidate as the single payer; the user can re-assign on the
      //    review screen. Multi-payer OCR stays future work.
      const payers = draft.payerCandidates.length > 0
        ? [
            createExpensePayer({
              id: asExpensePayerId(generateId()),
              expenseId: expenseId,
              memberId: asMemberId(draft.payerCandidates[0] as string),
              amountMinor: draft.amountMinor as number,
            }),
          ]
        : [];

      // 6. Splits via the DOMAIN equal-split engine — deterministic
      //    remainder allocation; Σ entries always equals the total.
      const participantCount = draft.participantCandidates.length;
      const splits: ReturnType<typeof createExpenseSplit>[] = [];
      if (participantCount > 0) {
        const total = Money.fromMinor(draft.amountMinor as number, draft.currencyCode as string);
        const splitResult = useItems
          ? calculateItemSplit(
              total,
              draft.participantCandidates,
              draft.lineItems.map((item) => ({
                id: item.id as string,
                totalAmountMinor: item.totalAmountMinor,
                assignedMemberIds: item.assignedMemberIds,
                quantity: item.quantity,
                unitPriceMinor: item.unitPriceMinor,
                ...(item.discountMinor !== undefined ? { discountMinor: item.discountMinor } : {}),
                ...(item.taxMinor !== undefined ? { taxMinor: item.taxMinor } : {}),
              })),
              draft.charges.map((charge) => ({
                type: charge.type,
                amountMinor: charge.amountMinor,
                ...(charge.label !== undefined ? { label: charge.label } : {}),
              })),
            )
          : SplitEngine.equal({
              totalAmount: total,
              participantIds: draft.participantCandidates,
            });
        for (const entry of splitResult.entries) {
          splits.push(
            createExpenseSplit({
              id: asExpenseSplitId(generateId()),
              expenseId: expenseId,
              memberId: asMemberId(entry.memberId as string),
              amountMinor: entry.amountMinor,
            }),
          );
        }
      }

      // 7. Validate the aggregate (all financial invariants).
      //    v2.5.0: the GROUP existence + currency invariant is enforced
      //    on the write path — the validator supported it but the caller
      //    never passed it, so a stray-currency draft confirmation was
      //    accepted and later crashed the balance engine.
      const group = await ctx.groups.findById(asGroupId(input.groupId));
      if (group === null) {
        throw new Error(`Group ${input.groupId} not found — select a group before confirming.`);
      }
      if (group.deletedAt !== undefined) {
        throw new Error(`Group ${input.groupId} is deleted.`);
      }
      validateExpenseAggregate(
        expense,
        payers,
        splits,
        group.currencyCode as unknown as Parameters<typeof validateExpenseAggregate>[3],
      );

      // 8. Save the expense + payers + splits atomically.
      await ctx.expenses.save(expense, payers, splits);

      // 9. Confirm the draft (transition `needs_review|ready → confirmed`).
      //    `confirmExpenseDraft` re-checks the version (optimistic
      //    concurrency) and rejects confirmation of confirmed/discarded
      //    drafts. We pass `input.expectedVersion` so the caller's view
      //    of the draft's version is enforced.
      const confirmedDraft = confirmExpenseDraft(draft, {
        confirmedExpenseId: expenseId,
        expectedVersion: input.expectedVersion,
      });
      await ctx.drafts.save(confirmedDraft);

      // NOTE (v2.4.0): no explicit ctx.enqueueSync here — the SQLite
      // expense repository co-enqueues the expense sync operation inside
      // the same transaction as the row writes (sync-op-writer.ts), which
      // is strictly safer. Enqueueing a second op with a different
      // idempotency key here would double-upload and surface as a
      // phantom server-side conflict.

      return {
        expenseId: expenseId as string,
        draftStatus: confirmedDraft.status,
        ...(receiptId !== undefined ? { receiptId: receiptId as string } : {}),
      };
    });
  }
}

// ---------------------------------------------------------------------------
// ID generator — uses Web Crypto when available, falls back to a
// timestamp + random string. Lives at the bottom of the file so the
// use-case logic stays at the top.
// ---------------------------------------------------------------------------

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Normalize a draft's `expenseDate` into a full ISO date-time string.
 *
 * The OCR pipeline produces date-only strings ("YYYY-MM-DD") but the
 * Expense entity requires a full ISO date-time ("YYYY-MM-DDTHH:mm:ss.sssZ").
 * This helper bridges that gap:
 *
 *   - undefined → current UTC time (the use case defaults to "now")
 *   - date-only "YYYY-MM-DD" → "YYYY-MM-DDT00:00:00.000Z"
 *   - full ISO date-time → returned unchanged (after `asDateTime` validation)
 *
 * Throws `InvalidEntityError` if the input cannot be parsed as a date.
 */
function normalizeExpenseDate(expenseDate: string | undefined): string {
  if (expenseDate === undefined || expenseDate.trim().length === 0) {
    return new Date().toISOString();
  }
  const trimmed = expenseDate.trim();
  // Fast path: already a full ISO date-time.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(trimmed)) {
    return trimmed;
  }
  // Date-only — normalize to midnight UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00.000Z`;
  }
  // Last resort: let Date.parse handle it.
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) {
    throw new InvalidEntityError(
      `Draft expenseDate is not a parseable date: "${expenseDate}"`,
    );
  }
  return new Date(ms).toISOString();
}
