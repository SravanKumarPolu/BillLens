/**
 * use-settlement-form — wraps the two-step settlement creation flow
 * (CreateSettlementDraftUseCase → RecordSettlementUseCase) behind a
 * single submit hook.
 *
 * Why two steps:
 *   - The settlement entity starts in `draft` state.
 *   - `RecordSettlementUseCase` transitions `draft|requested` →
 *     `pending_confirmation` (the receiver must confirm explicitly
 *     before balances move — Phase 6 safety principle).
 *   - Splitting the calls keeps each use case pure; this hook owns
 *     the orchestration and the idempotency token.
 *
 * Idempotency:
 *   - A client-generated `operationId` (UUID) is generated ONCE per
 *     submit attempt and reused across retries. `CreateSettlementDraft`
 *     is idempotent on `operationId` — a retry after a network
 *     failure returns the same settlement id, not a duplicate.
 *
 * Overpayment guard (Phase 3 — financial correctness):
 *   - Before creating the draft, the hook consults
 *     `PreviewSettlementImpactUseCase` (best-effort). When the typed
 *     amount exceeds what the payer owes — or the payer is actually a
 *     creditor — submit REJECTS with `SettlementOverpaymentError` and
 *     NO settlement is created. The UI shows a warning; only an
 *     explicit second submit with `confirmOverpayment: true` proceeds
 *     (intentional pay-ahead stays possible, accidental overpayment
 *     does not). The domain rules themselves are unchanged — a
 *     settlement remains recordable after explicit confirmation.
 *
 * Architecture:
 *   - Reads ONLY from the services registry (`@store/services-registry`)
 *     — never imports `@infrastructure/*`.
 *   - Input/output TYPES are imported from `@application/settlements`
 *     (presentation is allowed to import application-layer types).
 *   - The hook does NOT touch React Router — the caller decides what
 *     to do after a successful submit (typically `router.back()`).
 */

import { useCallback, useState } from 'react';

import { getCurrency } from '@domain/entities/currency';
import type { SettlementMethod } from '@domain/entities/settlement';
import { tryGetAppServices } from '@store/services-registry';

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export interface SettlementSubmitInput {
  readonly groupId: string;
  readonly fromMemberId: string;
  readonly toMemberId: string;
  /** User-typed major units string ("42.50") — parsed to minor units. */
  readonly amountMajor: string;
  readonly currencyCode: string;
  readonly method: SettlementMethod;
  readonly note: string;
  /**
   * Actor identity. Pre-identity this is the synthetic 'local-user' id
   * used by the manual expense form too; post-identity it is the
   * signed-in user's id.
   */
  readonly createdBy: string;
  /**
   * Actor member id (the payer). Recorded on the state-history entry
   * so the audit trail names "who" pressed record.
   */
  readonly actorMemberId?: string;
  /**
   * Explicit user confirmation after an overpayment warning. When
   * true the preview check is skipped and the settlement is recorded
   * even though it exceeds the payer's outstanding debt (intentional
   * pay-ahead). When false/absent an overpaying amount REJECTS.
   */
  readonly confirmOverpayment?: boolean;
}

/**
 * Why a submit was blocked by the overpayment guard.
 *
 *   - `'exceeds_outstanding'` — payer owes `outstandingMinor` but the
 *     typed amount is larger (includes the zero-debt case, where any
 *     positive amount exceeds the ₹0 outstanding).
 *   - `'payer_is_owed'` — the payer is a CREDITOR (the group owes
 *     them). Paying in this direction reduces what they're owed; only
 *     intentional in off-ledger reimbursement scenarios.
 */
export type SettlementOverpaymentReason = 'exceeds_outstanding' | 'payer_is_owed';

/** Payload carried by `SettlementOverpaymentError` + hook state. */
export interface SettlementOverpaymentWarning {
  readonly reason: SettlementOverpaymentReason;
  /** The typed amount, minor units. */
  readonly amountMinor: number;
  /** What the payer currently owes (|net|), minor units. */
  readonly outstandingMinor: number;
  readonly currencyCode: string;
  /** The payer's raw net balance (negative = owes, positive = owed). */
  readonly payerNetMinor: number;
}

/**
 * Typed error thrown when the overpayment guard blocks a submit.
 * Carries the warning payload so the screen can render specifics.
 * NOT a failure — it is a confirmation request.
 */
export class SettlementOverpaymentError extends Error {
  readonly warning: SettlementOverpaymentWarning;

  constructor(warning: SettlementOverpaymentWarning) {
    super('This payment exceeds what the payer owes. Confirm to record anyway.');
    this.name = 'SettlementOverpaymentError';
    this.warning = warning;
  }
}

export interface SettlementSubmitSuccess {
  /** The settlement id, ready for follow-up calls (confirm / dispute). */
  readonly settlementId: string;
  /** The lifecycle status after the record call (`pending_confirmation`). */
  readonly status: string;
  /** True if a brand-new draft was created; false if an idempotent retry returned the existing draft. */
  readonly created: boolean;
}

export interface UseSettlementFormResult {
  readonly submitting: boolean;
  readonly error: string | null;
  /** The idempotency token held across retries within the same submit. */
  readonly operationId: string;
  /** Non-null while an overpayment warning awaits explicit confirmation. */
  readonly overpayment: SettlementOverpaymentWarning | null;
  readonly submit: (input: SettlementSubmitInput) => Promise<SettlementSubmitSuccess>;
  /** Reset the error + operationId (call when the form re-opens). */
  readonly reset: () => void;
  /** Clear a pending overpayment warning (user chose to edit the amount). */
  readonly dismissOverpayment: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a user-typed decimal string ("42.50") into integer minor units
 * (4250), with the currency's decimals respected (JPY = 0, KWD = 3).
 *
 * Stricter than `Number(value) * 100` because floating-point math is
 * forbidden for financial amounts (see `domain/performance/floating-point-guard`).
 * Uses string arithmetic: split on '.', pad/truncate to the currency's
 * decimals, concatenate.
 *
 * REJECTS extra decimals beyond the currency's precision — entering
 * "5.123" for a USD amount is a user error, not a silent truncation.
 */
export function parseAmountToMinor(amountMajor: string, currencyCode: string): number {
  const trimmed = amountMajor.trim();
  if (trimmed.length === 0) return NaN;
  if (!/^\d+(\.\d+?)?$/.test(trimmed)) return NaN;

  const decimals = currencyDecimals(currencyCode);
  const [whole, fractionRaw] = trimmed.split('.');
  if (fractionRaw !== undefined && fractionRaw.length > decimals) {
    return NaN; // extra decimals — reject, do not silently truncate
  }
  const fraction = (fractionRaw ?? '').padEnd(decimals, '0').slice(0, decimals);
  // v2.4.0 guards: cap the integer-part length (15 digits max, matching
  // the expense-form parser) and require a SAFE integer result — a
  // 20-digit input previously overflowed into an unsafe double.
  if ((whole ?? '0').length > 15) return NaN;
  const wholeNum = Number.parseInt(whole ?? '0', 10);
  if (!Number.isFinite(wholeNum)) return NaN;
  if (decimals === 0) return Number.isSafeInteger(wholeNum) ? wholeNum : NaN;
  const fractionNum = Number.parseInt(fraction, 10);
  if (!Number.isFinite(fractionNum)) return NaN;
  const minor = wholeNum * 10 ** decimals + fractionNum;
  return Number.isSafeInteger(minor) ? minor : NaN;
}

/**
 * Number of decimal places a currency uses. JPY = 0, KWD = 3, most = 2.
 * v2.4.0: sourced from the DOMAIN currency table (single source of truth)
 * with a defensive fallback for codes outside the table.
 */
function currencyDecimals(currencyCode: string): number {
  const domain = getCurrency(currencyCode.toUpperCase() as never);
  return domain?.decimalPlaces ?? 2;
}

/**
 * Generate a v4 UUID. Uses Web Crypto when available, falls back to
 * timestamp + random. Same algorithm as the application-layer use cases
 * — duplicated here so presentation does not depend on application
 * internals for an id.
 */
function generateOperationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Submit hook for the settlement form. Wraps the two-step
 * create-draft → record-payment flow with idempotency + error handling.
 */
export function useSettlementForm(): UseSettlementFormResult {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operationId, setOperationId] = useState<string>(() => generateOperationId());
  const [overpayment, setOverpayment] = useState<SettlementOverpaymentWarning | null>(null);

  const reset = useCallback((): void => {
    setError(null);
    setSubmitting(false);
    setOverpayment(null);
    setOperationId(generateOperationId());
  }, []);

  const dismissOverpayment = useCallback((): void => {
    setOverpayment(null);
  }, []);

  const submit = useCallback(
    async (input: SettlementSubmitInput): Promise<SettlementSubmitSuccess> => {
      const services = tryGetAppServices();
      if (services === null) {
        const message = 'Storage is not ready yet. Try again in a moment.';
        setError(message);
        throw new Error(message);
      }

      const amountMinor = parseAmountToMinor(input.amountMajor, input.currencyCode);
      if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
        const message = 'Enter a positive amount.';
        setError(message);
        throw new Error(message);
      }

      if (input.fromMemberId === input.toMemberId) {
        const message = 'Payer and receiver cannot be the same member.';
        setError(message);
        throw new Error(message);
      }

      // ── Overpayment guard (Phase 3) ───────────────────────────
      // Best-effort: a failed/unavailable preview never blocks the
      // write path (offline-first). Only a DEFINITIVE "this overpays"
      // classification blocks, and it can be overridden explicitly.
      if (input.confirmOverpayment !== true) {
        const warning = await checkOverpayment(services, {
          groupId: input.groupId,
          payerMemberId: input.fromMemberId,
          receiverMemberId: input.toMemberId,
          amountMinor,
          currencyCode: input.currencyCode,
        });
        if (warning !== null) {
          setOverpayment(warning);
          setError(null);
          setSubmitting(false);
          throw new SettlementOverpaymentError(warning);
        }
        setOverpayment(null);
      } else {
        setOverpayment(null);
      }

      setSubmitting(true);
      setError(null);

      try {
        // 1) Create the draft (idempotent on operationId — a retry
        //    returns the same settlement, never a duplicate).
        const draft = await services.settlements.createSettlementDraft.execute({
          groupId: input.groupId,
          fromMemberId: input.fromMemberId,
          toMemberId: input.toMemberId,
          amountMinor,
          currencyCode: input.currencyCode,
          method: input.method,
          ...(input.note.trim().length > 0 ? { note: input.note.trim() } : {}),
          createdBy: input.createdBy,
          operationId,
        });

        // 2) Record the payment → transition to `pending_confirmation`.
        //    The receiver must explicitly confirm before balances move.
        const recorded = await services.settlements.recordSettlement.execute({
          settlementId: draft.settlementId,
          expectedVersion: 1, // freshly-created draft is at version 1
          ...(input.actorMemberId !== undefined
            ? { actorMemberId: input.actorMemberId as never }
            : {}),
          ...(input.note.trim().length > 0 ? { note: input.note.trim() } : {}),
        });

        setSubmitting(false);
        return {
          settlementId: recorded.settlement.id as string,
          status: (recorded.settlement.status ?? 'pending_confirmation') as string,
          created: draft.created,
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Could not record the settlement.';
        setError(message);
        setSubmitting(false);
        throw err instanceof Error ? err : new Error(message);
      }
    },
    [operationId],
  );

  return { submitting, error, operationId, overpayment, submit, reset, dismissOverpayment };
}

// ---------------------------------------------------------------------------
// Overpayment classification (pure helper, unit-testable)
// ---------------------------------------------------------------------------

/**
 * Minimal services shape the guard needs — structurally compatible with
 * the registry's `AppServices['explanations']` bucket so the hook can
 * pass the whole registry (or tests can pass a one-key stub).
 */
interface PreviewServices {
  readonly explanations: {
    readonly previewSettlementImpact: {
      execute(input: {
        readonly groupId: string;
        readonly payerMemberId: string;
        readonly receiverMemberId: string;
        readonly currencyCode: string;
        readonly amountMinor: number;
      }): Promise<{
        readonly notFound: boolean;
        readonly previews: readonly {
          readonly payerBefore: number;
          readonly isOverpayment: boolean;
        }[];
      }>;
    };
  };
}

/**
 * Classify a proposed settlement amount against the payer's net balance.
 *
 *   payer net < 0 (payer owes |net|):
 *     amount > |net|           → 'exceeds_outstanding' (flips payer to creditor)
 *     amount ≤ |net|           → null (within debt — normal settlement)
 *   payer net = 0: any positive amount → 'exceeds_outstanding' (owes nothing)
 *   payer net > 0 (payer is OWED): any payment reduces their receivable
 *                             → 'payer_is_owed'
 *
 * Returns `null` when the preview is unavailable, found no balances for
 * the pair, or the amount is within the outstanding debt — in all those
 * cases the write path proceeds untouched.
 *
 * Pure + async-free except for the preview call; wrapped in try/catch by
 * the caller contract (any preview failure ⇒ no warning ⇒ proceed).
 */
export async function checkOverpayment(
  services: PreviewServices,
  input: {
    readonly groupId: string;
    readonly payerMemberId: string;
    readonly receiverMemberId: string;
    readonly amountMinor: number;
    readonly currencyCode: string;
  },
): Promise<SettlementOverpaymentWarning | null> {
  let preview: Awaited<ReturnType<PreviewServices['explanations']['previewSettlementImpact']['execute']>>;
  try {
    preview = await services.explanations.previewSettlementImpact.execute({
      groupId: input.groupId,
      payerMemberId: input.payerMemberId,
      receiverMemberId: input.receiverMemberId,
      currencyCode: input.currencyCode,
      amountMinor: input.amountMinor,
    });
  } catch {
    // Best-effort guard: a broken preview must never block settlements.
    return null;
  }
  const first = preview.previews[0];
  if (first === undefined) {
    // No balance data for this pair/currency yet — nothing to warn about.
    return null;
  }

  const payerBefore = first.payerBefore;
  if (payerBefore > 0) {
    // Payer is a creditor: paying reduces what they're owed. Off-ledger
    // reimbursements are legitimate — warn, don't block silently.
    return {
      reason: 'payer_is_owed',
      amountMinor: input.amountMinor,
      outstandingMinor: 0,
      currencyCode: input.currencyCode,
      payerNetMinor: payerBefore,
    };
  }
  const outstanding = Math.abs(payerBefore); // payerBefore ≤ 0 here
  if (input.amountMinor > outstanding) {
    return {
      reason: 'exceeds_outstanding',
      amountMinor: input.amountMinor,
      outstandingMinor: outstanding,
      currencyCode: input.currencyCode,
      payerNetMinor: payerBefore,
    };
  }
  return null;
}
