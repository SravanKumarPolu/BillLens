/**
 * Billing model — invoices, proration, payment providers.
 *
 * Phase 10 Prompt 98: Revenue and Monetisation.
 *
 * This module is PURE: it computes billing decisions from inputs.
 * No I/O, no payment provider API calls. The actual integration
 * with Stripe / Razorpay / Apple IAP / Google Play lives in the
 * application layer.
 *
 * See `docs/revenue-monetisation.md`.
 */

import type { Plan } from './plan-model';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PaymentProvider =
  | 'stripe'
  | 'razorpay'
  | 'apple_iap'
  | 'google_play';

export type InvoiceStatus =
  | 'draft'
  | 'open'
  | 'paid'
  | 'void'
  | 'uncollectible';

export interface Invoice {
  /** Stable unique identifier. */
  readonly id: string;
  /** Subscription this invoice belongs to. */
  readonly subscriptionId: string;
  /** Invoice amount in MAJOR currency units (e.g. USD 14.99). */
  readonly amount: number;
  /** ISO 4217 currency code. */
  readonly currency: string;
  /** ISO date when the billing period started. */
  readonly periodStart: string;
  /** ISO date when the billing period ended. */
  readonly periodEnd: string;
  /** Current invoice status. */
  readonly status: InvoiceStatus;
  /** ISO date when the invoice is due. */
  readonly dueDate: string;
  /** ISO date when the invoice was paid (optional, only when paid). */
  readonly paidAt?: string;
  /** Payment provider that issued the invoice. */
  readonly provider: PaymentProvider;
  /** Provider's invoice identifier (optional, for reconciliation). */
  readonly providerInvoiceId?: string;
}

// ---------------------------------------------------------------------------
// Proration
// ---------------------------------------------------------------------------

/**
 * Computes proration when a user upgrades or downgrades mid-cycle.
 *
 * Returns:
 *   - `credit`: amount to credit the user for the unused portion of
 *     their CURRENT plan.
 *   - `charge`: amount to charge for the remaining portion of the
 *     NEW plan.
 *
 * Both are in MAJOR currency units (e.g. USD). When upgrading,
 * `charge > credit` and the user pays the difference. When
 * downgrading, `credit > charge` and the difference is applied as
 * account credit toward future invoices.
 *
 * Formula:
 *   credit = currentPlan.monthlyPrice * (daysRemaining / daysInPeriod)
 *   charge = newPlan.monthlyPrice * (daysRemaining / daysInPeriod)
 *
 * For yearly billing, the application layer should pass the YEARLY
 * price as the plan's monthlyPrice-equivalent (i.e. divide yearly by
 * 12 and use daysInPeriod=365). This function is agnostic to cycle.
 *
 * All amounts are rounded to 2 decimal places (cents).
 *
 * `daysRemaining` must be in [0, daysInPeriod]. Values outside this
 * range are clamped.
 */
export function computeProration(
  currentPlan: Plan,
  newPlan: Plan,
  daysRemaining: number,
  daysInPeriod: number,
): { credit: number; charge: number } {
  if (!Number.isFinite(daysInPeriod) || daysInPeriod <= 0) {
    return Object.freeze({ credit: 0, charge: 0 });
  }
  if (!Number.isFinite(daysRemaining)) {
    return Object.freeze({ credit: 0, charge: 0 });
  }
  // Clamp daysRemaining to [0, daysInPeriod].
  const safeDaysRemaining = Math.max(
    0,
    Math.min(daysRemaining, daysInPeriod),
  );
  const fraction = safeDaysRemaining / daysInPeriod;
  const credit = round2(currentPlan.monthlyPrice * fraction);
  const charge = round2(newPlan.monthlyPrice * fraction);
  return Object.freeze({ credit, charge });
}

/**
 * Returns the net amount owed when upgrading: charge - credit.
 *
 * Returns 0 when the net is negative (the user gains account credit
 * rather than a cash refund — we never issue cash refunds for
 * unused time; the credit is applied to the next invoice).
 */
export function getUpgradeNetCharge(
  currentPlan: Plan,
  newPlan: Plan,
  daysRemaining: number,
  daysInPeriod: number,
): number {
  const { credit, charge } = computeProration(
    currentPlan,
    newPlan,
    daysRemaining,
    daysInPeriod,
  );
  const net = charge - credit;
  return net > 0 ? round2(net) : 0;
}

/**
 * Returns the account credit granted when downgrading (credit > charge).
 *
 * Returns 0 when the net is positive (the user owes money — they're
 * upgrading).
 */
export function getDowngradeCredit(
  currentPlan: Plan,
  newPlan: Plan,
  daysRemaining: number,
  daysInPeriod: number,
): number {
  const { credit, charge } = computeProration(
    currentPlan,
    newPlan,
    daysRemaining,
    daysInPeriod,
  );
  const net = credit - charge;
  return net > 0 ? round2(net) : 0;
}

// ---------------------------------------------------------------------------
// Invoice helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the invoice is in a "paid" state.
 *
 * Only `status === 'paid'` counts. Drafts, open invoices, void
 * invoices, and uncollectible invoices are NOT paid.
 */
export function isInvoicePaid(invoice: Invoice): boolean {
  return invoice.status === 'paid';
}

/**
 * Returns true when the invoice is overdue (past due date and not paid).
 *
 * Void and uncollectible invoices are NOT overdue — they've been
 * written off.
 */
export function isInvoiceOverdue(invoice: Invoice, now: string): boolean {
  if (invoice.status === 'paid' || invoice.status === 'void' || invoice.status === 'uncollectible') {
    return false;
  }
  if (invoice.status === 'draft') {
    return false; // drafts aren't yet issued
  }
  // status === 'open'
  const nowMs = parseStrict(now);
  const dueMs = parseStrict(invoice.dueDate);
  if (nowMs === null || dueMs === null) {
    return false;
  }
  return nowMs > dueMs;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.round(n * 100) / 100;
}

function parseStrict(iso: string): number | null {
  if (typeof iso !== 'string' || iso.trim() === '') {
    return null;
  }
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}
