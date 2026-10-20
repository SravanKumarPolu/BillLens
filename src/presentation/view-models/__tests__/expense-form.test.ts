import { describe, expect, it } from '@jest/globals';

import {
  type ExpenseFormMember,
  type ManualExpenseFormState,
  createManualExpenseFormViewModel,
  currencyDecimals,
  isValidDateOnly,
  parseAmountToMinor,
  todayDateOnly,
} from '../expense-form';

/**
 * Manual expense-form view-model tests.
 *
 * The amount parser is the financially-sensitive piece: strict string
 * arithmetic, currency-aware decimals, no floats, no negatives, no
 * thousand separators. The split preview must be byte-identical to what
 * the use case persists (same DOMAIN engine).
 */

const MEMBERS: readonly ExpenseFormMember[] = [
  { id: 'm-alice', displayName: 'Alice' },
  { id: 'm-bob', displayName: 'Bob' },
  { id: 'm-carol', displayName: 'Carol' },
];

function makeState(overrides?: Partial<ManualExpenseFormState>): ManualExpenseFormState {
  return {
    title: 'Dinner',
    amountInput: '42.50',
    currencyCode: 'INR',
    dateInput: '2026-10-05',
    note: '',
    payerMemberId: 'm-alice',
    participantIds: ['m-alice', 'm-bob'],
    ...overrides,
  };
}

describe('parseAmountToMinor', () => {
  it('parses plain integers and decimals to minor units', () => {
    expect(parseAmountToMinor('42', 'INR')).toEqual({ ok: true, minor: 4200, error: null });
    expect(parseAmountToMinor('42.5', 'INR')).toEqual({ ok: true, minor: 4250, error: null });
    expect(parseAmountToMinor('42.50', 'INR')).toEqual({ ok: true, minor: 4250, error: null });
    expect(parseAmountToMinor(' 42.50 ', 'INR')).toEqual({ ok: true, minor: 4250, error: null });
    expect(parseAmountToMinor('0.01', 'USD')).toEqual({ ok: true, minor: 1, error: null });
  });

  it('honours zero-decimal currencies (JPY) and falls back to 2 for unknown codes', () => {
    expect(parseAmountToMinor('1000', 'JPY')).toEqual({ ok: true, minor: 1000, error: null });
    // JPY rejects any fractional digits.
    expect(parseAmountToMinor('42.5', 'JPY').ok).toBe(false);
    expect(parseAmountToMinor('42.5', 'JPY').error).toBe('JPY supports at most 0 decimals.');
    // INR rejects 3+ fractional digits.
    expect(parseAmountToMinor('42.505', 'INR').ok).toBe(false);
    // Unknown code → the 2-dp fallback applies.
    expect(parseAmountToMinor('42.505', 'ZZZ').ok).toBe(false);
    expect(parseAmountToMinor('42.5', 'ZZZ')).toEqual({ ok: true, minor: 4250, error: null });
  });

  it('rejects negatives, multiple dots, separators, symbols, and zero', () => {
    expect(parseAmountToMinor('-5', 'INR').ok).toBe(false);
    expect(parseAmountToMinor('4.2.5', 'INR').ok).toBe(false);
    expect(parseAmountToMinor('1,000', 'INR').ok).toBe(false);
    expect(parseAmountToMinimal_safe('₹42', 'INR').ok).toBe(false);
    expect(parseAmountToMinor('abc', 'INR').ok).toBe(false);
    expect(parseAmountToMinor('0', 'INR').ok).toBe(false);
    expect(parseAmountToMinor('0.00', 'INR').ok).toBe(false);
  });

  it('treats an empty input as "not yet entered" (no error)', () => {
    expect(parseAmountToMinor('', 'INR')).toEqual({ ok: false, minor: null, error: null });
    expect(parseAmountToMinor('   ', 'INR').ok).toBe(false);
  });

  it('rejects amounts beyond the safe-integer range', () => {
    expect(parseAmountToMinor('99999999999999999', 'INR').ok).toBe(false);
  });
});

// Wrapper only to keep the negative-case list tidy.
function parseAmountToMinimal_safe(raw: string, currency: string) {
  return parseAmountToMinor(raw, currency);
}

describe('currencyDecimals', () => {
  it('uses the domain currency table with a 2-dp fallback', () => {
    expect(currencyDecimals('JPY')).toBe(0);
    expect(currencyDecimals('INR')).toBe(2);
    expect(currencyDecimals('USD')).toBe(2);
    expect(currencyDecimals('ZZZ')).toBe(2);
  });
});

describe('isValidDateOnly', () => {
  it('accepts real calendar dates and rejects everything else', () => {
    expect(isValidDateOnly('2026-10-05')).toBe(true);
    expect(isValidDateOnly('2024-02-29')).toBe(true); // leap year
    expect(isValidDateOnly('2023-02-29')).toBe(false); // NOT a leap year
    expect(isValidDateOnly('2026-13-01')).toBe(false);
    expect(isValidDateOnly('2026-00-10')).toBe(false);
    expect(isValidDateOnly('2026-10-32')).toBe(false);
    expect(isValidDateOnly('05-10-2026')).toBe(false);
    expect(isValidDateOnly('2026/10/05')).toBe(false);
    expect(isValidDateOnly('')).toBe(false);
  });
});

describe('createManualExpenseFormViewModel', () => {
  it('valid form → canSubmit with parsed amount and split preview', () => {
    const vm = createManualExpenseFormViewModel({
      state: makeState(),
      members: MEMBERS,
      defaultCurrencyCode: 'INR',
    });
    expect(vm.canSubmit).toBe(true);
    expect(vm.amountMinor).toBe(4250);
    expect(vm.titleError).toBeNull();
    expect(vm.amountError).toBeNull();
    expect(vm.dateError).toBeNull();
    expect(vm.payerError).toBeNull();
    expect(vm.participantsError).toBeNull();
    // Equal split preview: 4250 / 2 = [2125, 2125].
    expect(vm.splitPreview).toEqual([
      { memberId: 'm-alice', displayName: 'Alice', amountMinor: 2125 },
      { memberId: 'm-bob', displayName: 'Bob', amountMinor: 2125 },
    ]);
  });

  it('uneven split preview matches the DOMAIN remainder rule (1000/3)', () => {
    const vm = createManualExpenseFormViewModel({
      state: makeState({ amountInput: '10', participantIds: ['m-alice', 'm-bob', 'm-carol'] }),
      members: MEMBERS,
      defaultCurrencyCode: 'INR',
    });
    expect(vm.splitPreview.map((e) => e.amountMinor)).toEqual([334, 333, 333]);
    expect(
      vm.splitPreview.reduce((acc, e) => acc + e.amountMinor, 0),
    ).toBe(1000);
  });

  it('flags each invalid field with a targeted message', () => {
    const vm = createManualExpenseFormViewModel({
      state: makeState({
        title: '   ',
        amountInput: '1,000',
        dateInput: '2026-02-30',
        payerMemberId: null,
        participantIds: [],
      }),
      members: MEMBERS,
      defaultCurrencyCode: 'INR',
    });
    expect(vm.canSubmit).toBe(false);
    expect(vm.titleError).toBe('What was this expense for? Add a title.');
    expect(vm.amountError).toBe('Enter a valid amount, like 42.50.');
    expect(vm.dateError).toBe('Use a valid date (YYYY-MM-DD).');
    expect(vm.payerError).toBe('Choose who paid this expense.');
    expect(vm.participantsError).toBe('Choose at least one person to split with.');
    expect(vm.amountMinor).toBeNull();
    expect(vm.splitPreview).toEqual([]);
  });

  it('empty amount is NOT an error (just not submittable)', () => {
    const vm = createManualExpenseFormViewModel({
      state: makeState({ amountInput: '' }),
      members: MEMBERS,
      defaultCurrencyCode: 'INR',
    });
    expect(vm.amountError).toBeNull();
    expect(vm.canSubmit).toBe(false);
    expect(vm.amountMinor).toBeNull();
  });

  it('empty date is valid (defaults to today in the use case)', () => {
    const vm = createManualExpenseFormViewModel({
      state: makeState({ dateInput: '' }),
      members: MEMBERS,
      defaultCurrencyCode: 'INR',
    });
    expect(vm.dateError).toBeNull();
    expect(vm.canSubmit).toBe(true);
  });

  it('falls back to the group default currency when none is selected', () => {
    const vm = createManualExpenseFormViewModel({
      state: makeState({ currencyCode: '', amountInput: '100' }),
      members: MEMBERS,
      defaultCurrencyCode: 'JPY',
    });
    // JPY: 100 major = 100 minor (0 decimals).
    expect(vm.amountMinor).toBe(100);
    expect(vm.splitPreview.map((e) => e.amountMinor)).toEqual([50, 50]);
  });

  it('title length boundary mirrors the domain (200 max)', () => {
    const tooLong = 'x'.repeat(201);
    const vm = createManualExpenseFormViewModel({
      state: makeState({ title: tooLong }),
      members: MEMBERS,
      defaultCurrencyCode: 'INR',
    });
    expect(vm.titleError).toBe('Title must be at most 200 characters.');
    expect(vm.canSubmit).toBe(false);
  });
});

describe('todayDateOnly', () => {
  it('formats the current UTC date with zero padding', () => {
    expect(todayDateOnly(new Date(Date.UTC(2026, 0, 5)))).toBe('2026-01-05');
    expect(todayDateOnly(new Date(Date.UTC(2026, 10, 25)))).toBe('2026-11-25');
  });
});
