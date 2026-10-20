/**
 * Manual expense-form view models.
 *
 * Pure projection + validation for the `/expenses/new` form. No I/O, no
 * React, no stores — fully unit-testable without rendering.
 *
 * FINANCIAL SAFETY: the decimal-string → minor-units parser is STRICT
 * string arithmetic (no parseFloat of user input, no float
 * multiplication), mirroring the domain `Money` conventions. The split
 * preview uses the DOMAIN split engine (`calculateEqualSplit`) — the
 * same deterministic function the `CreateExpenseManuallyUseCase`
 * persists — so what the user previews is EXACTLY what is saved.
 */

import { getCurrency } from '@domain/entities/currency';
import { calculateEqualSplit } from '@domain/services/splits';
import { Money } from '@domain/value-objects';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A member option rendered by the payer / participant pickers. */
export interface ExpenseFormMember {
  readonly id: string;
  readonly displayName: string;
}

/** Raw form state — exactly what the screen's useState hooks hold. */
export interface ManualExpenseFormState {
  readonly title: string;
  /** Raw decimal string as typed (e.g. "42.50"). Not yet parsed. */
  readonly amountInput: string;
  readonly currencyCode: string;
  /** Date-only string "YYYY-MM-DD", or empty for "today". */
  readonly dateInput: string;
  readonly note: string;
  readonly payerMemberId: string | null;
  readonly participantIds: readonly string[];
}

export interface ManualExpenseFormInput {
  readonly state: ManualExpenseFormState;
  readonly members: readonly ExpenseFormMember[];
  /** Fallback currency when the form has none selected yet. */
  readonly defaultCurrencyCode: string;
}

export interface SplitPreviewEntry {
  readonly memberId: string;
  readonly displayName: string;
  readonly amountMinor: number;
}

export interface ManualExpenseFormViewModel {
  readonly titleError: string | null;
  readonly amountError: string | null;
  readonly dateError: string | null;
  readonly payerError: string | null;
  readonly participantsError: string | null;
  /** True when every field passes validation. */
  readonly canSubmit: boolean;
  /** Parsed minor units, or null while the amount is invalid/empty. */
  readonly amountMinor: number | null;
  /**
   * Per-participant preview computed by the DOMAIN split engine —
   * identical to the shares the use case will persist.
   */
  readonly splitPreview: readonly SplitPreviewEntry[];
}

// ---------------------------------------------------------------------------
// Constants (mirror the domain entity rules)
// ---------------------------------------------------------------------------

export const EXPENSE_FORM_TITLE_MAX_LENGTH = 200;
export const EXPENSE_FORM_NOTE_MAX_LENGTH = 1000;

// ---------------------------------------------------------------------------
// Amount parsing — strict, no floats
// ---------------------------------------------------------------------------

export interface AmountParseResult {
  readonly ok: boolean;
  readonly minor: number | null;
  readonly error: string | null;
}

/**
 * Parse a user-typed decimal amount into integer minor units.
 *
 * Accepted: "42", "42.5", "42.50" — with at most as many fractional
 * digits as the currency supports (2 for INR/USD/EUR, 0 for JPY, 3 for
 * KWD). Rejected: negatives, multiple dots, thousands separators, other
 * symbols, zero, and over-long inputs.
 *
 * Pure string arithmetic — the same discipline the domain `Money`
 * value object applies, applied BEFORE anything numeric exists.
 */
export function parseAmountToMinor(
  raw: string,
  currencyCode: string,
): AmountParseResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, minor: null, error: null };
  }
  const decimals = currencyDecimals(currencyCode);

  const match = trimmed.match(/^(\d{1,15})(?:\.(\d{1,15}))?$/);
  if (match === null) {
    return {
      ok: false,
      minor: null,
      error: 'Enter a valid amount, like 42.50.',
    };
  }
  const integerPart = match[1] ?? '';
  const fractionalPart = match[2] ?? '';

  if (fractionalPart.length > decimals) {
    return {
      ok: false,
      minor: null,
      error: `${currencyCode} supports at most ${decimals} decimal${decimals === 1 ? '' : 's'}.`,
    };
  }

  const paddedFraction = fractionalPart.padEnd(decimals, '0');
  const minor =
    Number.parseInt(integerPart, 10) * 10 ** decimals +
    (decimals > 0 ? Number.parseInt(paddedFraction, 10) : 0);

  if (!Number.isSafeInteger(minor)) {
    return { ok: false, minor: null, error: 'Amount is too large.' };
  }
  if (minor <= 0) {
    return { ok: false, minor: null, error: 'Amount must be greater than zero.' };
  }
  return { ok: true, minor, error: null };
}

/** Decimal places for a currency (domain currency table; 2 fallback). */
export function currencyDecimals(currencyCode: string): number {
  return getCurrency(currencyCode as never)?.decimalPlaces ?? 2;
}

// ---------------------------------------------------------------------------
// Date validation
// ---------------------------------------------------------------------------

/** Validate a "YYYY-MM-DD" date-only string against the real calendar. */
export function isValidDateOnly(raw: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [year, month, day] = raw.split('-').map((p) => Number.parseInt(p, 10));
  if (month === undefined || day === undefined || year === undefined) return false;
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

// ---------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------

export function createManualExpenseFormViewModel(
  input: ManualExpenseFormInput,
): ManualExpenseFormViewModel {
  const { state } = input;
  const currencyCode =
    state.currencyCode.trim().length > 0 ? state.currencyCode : input.defaultCurrencyCode;

  // Title
  const trimmedTitle = state.title.trim();
  let titleError: string | null = null;
  if (trimmedTitle.length === 0) {
    titleError = 'What was this expense for? Add a title.';
  } else if (trimmedTitle.length > EXPENSE_FORM_TITLE_MAX_LENGTH) {
    titleError = `Title must be at most ${EXPENSE_FORM_TITLE_MAX_LENGTH} characters.`;
  }

  // Amount
  const amount = parseAmountToMinor(state.amountInput, currencyCode);
  const amountError = amount.error;

  // Date (empty means "today" — the use case defaults it)
  let dateError: string | null = null;
  if (state.dateInput.trim().length > 0 && !isValidDateOnly(state.dateInput)) {
    dateError = 'Use a valid date (YYYY-MM-DD).';
  }

  // Payer
  const payerError =
    state.payerMemberId === null ? 'Choose who paid this expense.' : null;

  // Participants
  let participantsError: string | null = null;
  if (state.participantIds.length === 0) {
    participantsError = 'Choose at least one person to split with.';
  }

  // Split preview — only meaningful once the amount parses and there
  // is at least one participant. Uses the DOMAIN engine so the preview
  // is byte-identical to the persisted shares.
  let splitPreview: readonly SplitPreviewEntry[] = [];
  if (amount.ok && amount.minor !== null && state.participantIds.length > 0) {
    try {
      const total = Money.fromMinor(amount.minor, currencyCode);
      const result = calculateEqualSplit(
        total,
        state.participantIds.map((id) => id as never),
      );
      const nameById = new Map(input.members.map((m) => [m.id, m.displayName]));
      splitPreview = result.entries.map((entry) => ({
        memberId: entry.memberId,
        displayName: nameById.get(entry.memberId) ?? 'Unknown member',
        amountMinor: entry.amountMinor,
      }));
    } catch {
      // A currency the domain rejects → the amount error path will
      // surface it on submit; keep the preview empty.
      splitPreview = [];
    }
  }

  const canSubmit =
    titleError === null &&
    amount.ok &&
    dateError === null &&
    payerError === null &&
    participantsError === null;

  return {
    titleError,
    amountError,
    dateError,
    payerError,
    participantsError,
    canSubmit,
    amountMinor: amount.ok ? amount.minor : null,
    splitPreview,
  };
}

/** Today's date as "YYYY-MM-DD" (the form's default value). */
export function todayDateOnly(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
