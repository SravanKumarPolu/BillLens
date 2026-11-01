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
import { calculateEqualSplit, calculateSplit } from '@domain/services/splits';
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
export type ExpenseSplitMethod = 'equal' | 'exact' | 'percentage' | 'shares';

export interface ManualExpenseFormState {
  readonly title: string;
  /** Raw decimal string as typed (e.g. "42.50"). Not yet parsed. */
  readonly amountInput: string;
  readonly currencyCode: string;
  /** Date-only string "YYYY-MM-DD", or empty for "today". */
  readonly dateInput: string;
  readonly note: string;
  readonly payerMemberId: string | null;
  /** When set, overrides the single payer (multiple payers). */
  readonly payerContributions?: readonly { readonly memberId: string; readonly amountInput: string }[];
  readonly participantIds: readonly string[];
  /** Defaults to 'equal' when omitted (older callers/tests). */
  readonly splitType?: ExpenseSplitMethod;
  /** Member-keyed raw inputs: amount, percentage or share units. */
  readonly splitValues?: Readonly<Record<string, string>>;
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
  readonly splitError: string | null;
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
  options: { readonly allowZero?: boolean } = {},
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
  if (minor < 0 || (minor === 0 && options.allowZero !== true)) {
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

  // Payer(s)
  let payerError: string | null = null;
  const multiplePayers = state.payerContributions !== undefined && state.payerContributions.length > 0;
  if (multiplePayers) {
    const rows = state.payerContributions ?? [];
    const seen = new Set<string>();
    let total = 0;
    for (const row of rows) {
      if (row.memberId.length === 0) {
        payerError = 'Choose a member for every payer row.';
        break;
      }
      if (seen.has(row.memberId)) {
        payerError = 'A member can only appear once as a payer.';
        break;
      }
      seen.add(row.memberId);
      const parsed = parseAmountToMinor(row.amountInput, currencyCode, { allowZero: true });
      if (!parsed.ok || parsed.minor === null) {
        payerError = 'Enter a valid contribution for every payer.';
        break;
      }
      total += parsed.minor;
    }
    if (payerError === null && amount.ok && amount.minor !== null && total !== amount.minor) {
      payerError = `Payer contributions add up to ${formatMinor(total, currencyCode)}, but the total is ${formatMinor(amount.minor, currencyCode)}.`;
    }
  } else if (state.payerMemberId === null) {
    payerError = 'Choose who paid this expense.';
  }

  // Participants
  let participantsError: string | null = null;
  if (state.participantIds.length === 0) {
    participantsError = 'Choose at least one person to split with.';
  }

  // Split preview — only meaningful once the amount parses and there is at
  // least one participant. Uses the DOMAIN engine so the preview is
  // byte-identical to the persisted shares, for every split method.
  const splitType: ExpenseSplitMethod = state.splitType ?? 'equal';
  const splitValues = state.splitValues ?? {};
  let splitError: string | null = null;
  let splitPreview: readonly SplitPreviewEntry[] = [];
  const nameById = new Map(input.members.map((m) => [m.id, m.displayName]));

  if (amount.ok && amount.minor !== null && state.participantIds.length > 0) {
    try {
      const total = Money.fromMinor(amount.minor, currencyCode);
      const participantIds = state.participantIds.map((id) => id as never);

      if (splitType === 'exact') {
        const parsed = state.participantIds.map((id) =>
          parseAmountToMinor(splitValues[id] ?? '', currencyCode, { allowZero: true }),
        );
        const invalidIndex = parsed.findIndex((entry) => !entry.ok || entry.minor === null);
        if (invalidIndex !== -1) {
          const memberId = state.participantIds[invalidIndex]!;
          splitError = `Enter an exact amount for ${nameById.get(memberId) ?? 'each member'}.`;
        } else {
          const allocated = parsed.reduce((sum, entry) => sum + (entry.minor ?? 0), 0);
          if (allocated !== amount.minor) {
            splitError = `Exact amounts add up to ${formatMinor(allocated, currencyCode)}, but the total is ${formatMinor(amount.minor, currencyCode)}.`;
          } else {
            const result = calculateSplit({
              totalAmount: total,
              participantIds,
              splitType: 'exact',
              exactAmounts: parsed.map((entry) => Money.fromMinor(entry.minor ?? 0, currencyCode)),
            });
            splitPreview = result.entries.map((entry) => ({
              memberId: entry.memberId,
              displayName: nameById.get(entry.memberId) ?? 'Unknown member',
              amountMinor: entry.amountMinor,
            }));
          }
        }
      } else if (splitType === 'percentage') {
        const parsed = state.participantIds.map((id) =>
          parsePercentBasisPoints(splitValues[id] ?? ''),
        );
        const invalidIndex = parsed.findIndex((entry) => entry.basisPoints === null);
        if (invalidIndex !== -1) {
          const memberId = state.participantIds[invalidIndex]!;
          splitError = `Enter a percentage for ${nameById.get(memberId) ?? 'each member'}.`;
        } else {
          const sum = parsed.reduce((acc, entry) => acc + (entry.basisPoints ?? 0), 0);
          if (sum !== 10_000) {
            splitError = `Percentages add up to ${(sum / 100).toFixed(2)}%; they must total 100%.`;
          } else {
            const result = calculateSplit({
              totalAmount: total,
              participantIds,
              splitType: 'percentage',
              basisPoints: parsed.map((entry) => entry.basisPoints ?? 0),
            });
            splitPreview = result.entries.map((entry) => ({
              memberId: entry.memberId,
              displayName: nameById.get(entry.memberId) ?? 'Unknown member',
              amountMinor: entry.amountMinor,
            }));
          }
        }
      } else if (splitType === 'shares') {
        const parsed = state.participantIds.map((id) => parseShareUnits(splitValues[id] ?? ''));
        const invalidIndex = parsed.findIndex((entry) => entry.units === null);
        if (invalidIndex !== -1) {
          const memberId = state.participantIds[invalidIndex]!;
          splitError = `Enter share units (1 or more) for ${nameById.get(memberId) ?? 'each member'}.`;
        } else {
          const result = calculateSplit({
            totalAmount: total,
            participantIds,
            splitType: 'shares',
            shareUnits: parsed.map((entry) => entry.units ?? 0),
          });
          splitPreview = result.entries.map((entry) => ({
            memberId: entry.memberId,
            displayName: nameById.get(entry.memberId) ?? 'Unknown member',
            amountMinor: entry.amountMinor,
          }));
        }
      } else {
        const result = calculateEqualSplit(total, participantIds);
        splitPreview = result.entries.map((entry) => ({
          memberId: entry.memberId,
          displayName: nameById.get(entry.memberId) ?? 'Unknown member',
          amountMinor: entry.amountMinor,
        }));
      }
    } catch (error) {
      splitError = error instanceof Error ? error.message : 'This split is not valid.';
      splitPreview = [];
    }
  }

  const canSubmit =
    titleError === null &&
    amount.ok &&
    dateError === null &&
    payerError === null &&
    participantsError === null &&
    splitError === null;

  return {
    titleError,
    amountError,
    dateError,
    payerError,
    participantsError,
    splitError,
    canSubmit,
    amountMinor: amount.ok ? amount.minor : null,
    splitPreview,
  };
}

/** Parse "33.33" into 3333 basis points (max 2 decimals, 0–100%). */
export function parsePercentBasisPoints(raw: string): { basisPoints: number | null } {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{1,3})(?:\.(\d{1,2}))?$/);
  if (match === null) return { basisPoints: null };
  const whole = Number.parseInt(match[1] ?? '', 10);
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const basisPoints = whole * 100 + Number.parseInt(fraction || '0', 10);
  if (basisPoints < 0 || basisPoints > 10_000) return { basisPoints: null };
  return { basisPoints };
}

/** Parse positive integer share units. */
export function parseShareUnits(raw: string): { units: number | null } {
  const trimmed = raw.trim();
  if (!/^\d{1,6}$/.test(trimmed)) return { units: null };
  const units = Number.parseInt(trimmed, 10);
  return units > 0 ? { units } : { units: null };
}

/** Minor units formatted for an error message (best-effort, no throw). */
function formatMinor(amountMinor: number, currencyCode: string): string {
  try {
    const decimals = currencyDecimals(currencyCode);
    const divisor = 10 ** decimals;
    const major = Math.floor(amountMinor / divisor);
    const fraction = amountMinor % divisor;
    return decimals === 0
      ? `${major} ${currencyCode}`
      : `${major}.${String(fraction).padStart(decimals, '0')} ${currencyCode}`;
  } catch {
    return `${amountMinor} ${currencyCode}`;
  }
}

/** Today's date as "YYYY-MM-DD" (the form's default value). */
export function todayDateOnly(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
