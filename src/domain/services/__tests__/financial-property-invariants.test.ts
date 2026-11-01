/**
 * Property-based financial invariants (v2.4.0).
 *
 * The project deliberately uses IN-HOUSE deterministic generators (seeded
 * xorshift PRNG) rather than adding fast-check as a dependency — known
 * limitation #5 in IMPLEMENTATION_STATUS.md. Determinism keeps failures
 * reproducible from the seed printed here.
 *
 * Properties proven (Phase 3 requirements):
 *   P1  Equal split: Σ shares === total for ANY amount & participant count;
 *       every share within [floor(total/n), ceil(total/n)].
 *   P2  Percentage split: Σ shares === total for ANY basis-point
 *       allocation summing to exactly 10,000.
 *   P3  Share split: Σ shares === total for ANY positive integer shares.
 *   P4  Money round-trip: minor → major string → parse → identical minor,
 *       for every supported currency (0/2/3 decimals).
 *   P5  The shared money parser REJECTS over-precision, negatives,
 *       multi-dot, commas, and overflow for every currency.
 *   P6  Determinism: identical inputs produce identical split vectors
 *       (cross-device reproducibility).
 *   P7  Non-divisible amounts split exactly for every remainder pattern
 *       (the v2.3.0 naive-floor defect class).
 *   P8  Every split way (equal / percentage / share / exact) preserves
 *       the total in EVERY currency scale (0/2/3 decimals), including
 *       the 1-minor-unit boundary.
 */

import { describe, expect, it } from '@jest/globals';

import { SUPPORTED_CURRENCIES } from '@domain/entities/currency';
import {
  calculateEqualSplit,
  calculateExactSplit,
  calculatePercentageSplit,
  calculateShareSplit,
} from '@domain/services/splits';
import { Money } from '@domain/value-objects';
import type { MemberId } from '@shared-types/index';

import { parseMoneyInput } from '../../../presentation/utils/parse-money-input';

// ---------------------------------------------------------------------------
// Deterministic PRNG (xorshift32) — seed printed for replay on failure.
// ---------------------------------------------------------------------------

const SEED = 20261011; // v2.4.0 release date — stable corpus

function makeRng(seed: number): () => number {
  let state = seed | 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state |= 0;
    return (state >>> 0) / 0xffffffff;
  };
}

const rng = makeRng(SEED);
const randomInt = (minInclusive: number, maxInclusive: number): number =>
  minInclusive + Math.floor(rng() * (maxInclusive - minInclusive + 1));

const MEMBERS: readonly MemberId[] = ['m-a', 'm-b', 'm-c', 'm-d', 'm-e', 'm-f'].map(
  (id) => id as MemberId,
);

const RUNS = 300;

describe('P1 — equal split preserves the total for ANY inputs', () => {
  it(`Σ shares === total across ${RUNS} random cases (seed ${SEED})`, () => {
    for (let run = 0; run < RUNS; run += 1) {
      const total = randomInt(1, 100_000_000);
      const n = randomInt(1, MEMBERS.length);
      const participants = MEMBERS.slice(0, n);
      const money = Money.fromMinor(total, 'INR');

      const result = calculateEqualSplit(money, participants);

      expect(result.entries).toHaveLength(n);
      const sum = result.entries.reduce((acc, e) => acc + e.amountMinor, 0);
      expect(sum).toBe(total);

      // Each share is within the floor/ceil band — no participant can
      // gain more than one extra minor unit.
      const floorShare = Math.floor(total / n);
      const ceilShare = Math.ceil(total / n);
      for (const entry of result.entries) {
        expect(entry.amountMinor).toBeGreaterThanOrEqual(floorShare);
        expect(entry.amountMinor).toBeLessThanOrEqual(ceilShare);
      }
    }
  });
});

describe('P2 — percentage split preserves the total for ANY 10,000bp allocation', () => {
  it(`Σ shares === total across ${RUNS} random allocations (seed ${SEED})`, () => {
    for (let run = 0; run < RUNS; run += 1) {
      const total = randomInt(1, 100_000_000);
      const n = randomInt(1, 6);
      const participants = MEMBERS.slice(0, n);

      // Random positive weights normalised to exactly 10,000 basis
      // points (floor the first n-1, give the drift to the last).
      const weights = Array.from({ length: n }, () => randomInt(1, 1000));
      const weightSum = weights.reduce((a, b) => a + b, 0);
      const basisPoints: number[] = [];
      let assigned = 0;
      for (let i = 0; i < n - 1; i += 1) {
        const bp = Math.floor((weights[i]! * 10_000) / weightSum);
        basisPoints.push(bp);
        assigned += bp;
      }
      basisPoints.push(10_000 - assigned);
      expect(basisPoints.reduce((a, b) => a + b, 0)).toBe(10_000);

      const result = calculatePercentageSplit(
        Money.fromMinor(total, 'USD'),
        participants,
        basisPoints,
      );

      const sum = result.entries.reduce((acc, e) => acc + e.amountMinor, 0);
      expect(sum).toBe(total);
    }
  });
});

describe('P3 — share split preserves the total for ANY integer shares', () => {
  it(`Σ shares === total across ${RUNS} random share vectors (seed ${SEED})`, () => {
    for (let run = 0; run < RUNS; run += 1) {
      const total = randomInt(1, 100_000_000);
      const n = randomInt(1, 6);
      const participants = MEMBERS.slice(0, n);
      const shares = Array.from({ length: n }, () => randomInt(1, 50));

      const result = calculateShareSplit(Money.fromMinor(total, 'EUR'), participants, shares);

      const sum = result.entries.reduce((acc, e) => acc + e.amountMinor, 0);
      expect(sum).toBe(total);
    }
  });
});

describe('P4 — money round-trips through every supported currency scale', () => {
  const CURRENCIES = SUPPORTED_CURRENCIES.map((c) => ({
    code: c.code as string,
    decimals: c.decimalPlaces,
  }));

  it.each(CURRENCIES)('$code round-trips minor→string→minor', ({ code, decimals }) => {
    for (let run = 0; run < RUNS; run += 1) {
      const minor = randomInt(1, 1_000_000_000);

      // minor → major display string (integer arithmetic) → parser.
      const divisor = 10 ** decimals;
      const whole = Math.floor(minor / divisor);
      const fraction = minor % divisor;
      const major =
        decimals === 0
          ? String(whole)
          : `${whole}.${fraction.toString().padStart(decimals, '0')}`;

      const parsed = parseMoneyInput(major, code);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.minor).toBe(minor);
      }
    }
  });

  it('Money.fromMinor keeps minor units exactly for every currency', () => {
    for (const { code } of CURRENCIES) {
      for (let run = 0; run < 50; run += 1) {
        const minor = randomInt(1, 1_000_000);
        const money = Money.fromMinor(minor, code as never);
        expect(money.toMinor()).toBe(minor);
      }
    }
  });
});

describe('P5 — the shared money parser rejects invalid inputs for every currency', () => {
  const CODES = ['INR', 'USD', 'JPY', 'KWD'] as const;

  it.each([...CODES])('%s rejects negatives, multi-dot, commas, overflow', (code) => {
    for (const bad of ['-5', '-0.01', '1.2.3', '1,250', '1e3', '0x10', '']) {
      expect(parseMoneyInput(bad, code).ok).toBe(false);
    }
    // Surrounding whitespace is trimmed — valid input (paste tolerance).
    expect(parseMoneyInput(' 12 ', code).ok).toBe(true);
    // 20-digit overflow must be rejected (safe-integer guard), not parsed.
    expect(parseMoneyInput('99999999999999999999', code).ok).toBe(false);
    // Zero is invalid for an expense amount.
    expect(parseMoneyInput('0', code).ok).toBe(false);
    expect(parseMoneyInput('0.00', code).ok).toBe(false);
  });

  it('rejects over-precision per currency scale (no silent truncation)', () => {
    expect(parseMoneyInput('5.123', 'USD').ok).toBe(false);
    expect(parseMoneyInput('5.1234', 'KWD').ok).toBe(false);
    expect(parseMoneyInput('5.5', 'JPY').ok).toBe(false); // JPY has no decimals
    expect(parseMoneyInput('500.00', 'JPY').ok).toBe(true); // pasted zeros ok
    expect(parseMoneyInput('5.123', 'KWD')).toEqual({ ok: true, minor: 5123 });
  });

  it('parses in-scale values exactly where floats famously misbehave', () => {
    // These are the values where Math.round(parseFloat(x) * 100) yields
    // the WRONG minor unit; string arithmetic is exact.
    expect(parseMoneyInput('0.1', 'USD')).toEqual({ ok: true, minor: 10 });
    expect(parseMoneyInput('0.29', 'USD')).toEqual({ ok: true, minor: 29 });
    expect(parseMoneyInput('0.07', 'USD')).toEqual({ ok: true, minor: 7 });
    expect(parseMoneyInput('2.67', 'USD')).toEqual({ ok: true, minor: 267 });
    expect(parseMoneyInput('19.99', 'USD')).toEqual({ ok: true, minor: 1999 });
    // Over-precision is REJECTED per domain policy — never silently
    // rounded ('1.005' USD is 100.5 cents, not money).
    expect(parseMoneyInput('1.005', 'USD').ok).toBe(false);
    expect(parseMoneyInput('2.675', 'USD').ok).toBe(false);
  });
});

describe('P6 — split determinism (cross-device reproducibility)', () => {
  it('identical inputs produce identical vectors, regardless of call order', () => {
    const total = 10_001;
    const participants = MEMBERS.slice(0, 4);
    const a = calculateEqualSplit(Money.fromMinor(total, 'INR'), participants);
    const b = calculateEqualSplit(Money.fromMinor(total, 'INR'), [...participants].reverse());

    // Sorted by participant id in the result — both orders must agree.
    const sortById = (entries: readonly { memberId: MemberId; amountMinor: number }[]) =>
      [...entries].sort((x, y) => (x.memberId < y.memberId ? -1 : 1));
    expect(sortById(a.entries)).toEqual(sortById(b.entries));

    // Repeated calls are stable.
    for (let i = 0; i < 25; i += 1) {
      const c = calculateEqualSplit(Money.fromMinor(total, 'INR'), participants);
      expect(sortById(c.entries)).toEqual(sortById(a.entries));
    }
  });
});

describe('P7 — non-divisible amounts split exactly (v2.3.0 defect class)', () => {
  it('every remainder pattern across participant counts 2..8 sums exactly', () => {
    // The old naive floor split rejected totals not divisible by N; the
    // domain engine allocates remainders deterministically.
    for (let n = 2; n <= 8; n += 1) {
      for (let remainder = 0; remainder < n; remainder += 1) {
        const total = 1000 * n + remainder;
        const participants = MEMBERS.slice(0, n);
        const result = calculateEqualSplit(Money.fromMinor(total, 'INR'), participants);
        const sum = result.entries.reduce((acc, e) => acc + e.amountMinor, 0);
        expect(sum).toBe(total);
      }
    }
  });
});

describe('P8 — every split way preserves the total in EVERY currency scale', () => {
  // Zero-decimal (JPY/KRW/VND), two-decimal (USD/EUR/GBP/INR/...) and
  // three-decimal (KWD/BHD) currencies exercise different minor-unit
  // magnitudes for the same major amount — the split engines must be
  // scale-agnostic because they operate purely on minor units.
  const CURRENCIES = SUPPORTED_CURRENCIES.map((c) => ({
    code: c.code as string,
    decimals: c.decimalPlaces,
  }));

  it.each(CURRENCIES)(
    '$code ($decimals dp): equal / percentage / share / exact all sum to the total',
    ({ code }) => {
      const CASES = 60;
      for (let run = 0; run < CASES; run += 1) {
        const total = randomInt(1, 50_000_007); // primes, non-divisible patterns
        const n = randomInt(2, 6);
        const participants = MEMBERS.slice(0, n);
        const money = Money.fromMinor(total, code);

        // 1) Equal.
        const equal = calculateEqualSplit(money, participants);
        expect(equal.entries.reduce((a, e) => a + e.amountMinor, 0)).toBe(total);

        // 2) Percentage — random weights normalised to 10,000 bp.
        const weights = Array.from({ length: n }, () => randomInt(1, 1000));
        const weightSum = weights.reduce((a, b) => a + b, 0);
        const basisPoints: number[] = [];
        let assigned = 0;
        for (let i = 0; i < n - 1; i += 1) {
          const bp = Math.floor((weights[i]! * 10_000) / weightSum);
          basisPoints.push(bp);
          assigned += bp;
        }
        basisPoints.push(10_000 - assigned);
        const pct = calculatePercentageSplit(money, participants, basisPoints);
        expect(pct.entries.reduce((a, e) => a + e.amountMinor, 0)).toBe(total);

        // 3) Shares.
        const shares = Array.from({ length: n }, () => randomInt(1, 40));
        const shareResult = calculateShareSplit(money, participants, shares);
        expect(shareResult.entries.reduce((a, e) => a + e.amountMinor, 0)).toBe(total);

        // 4) Exact — allocate a valid exact vector via the equal engine
        //    (a hand-rolled vector could under/over-sum by construction).
        const exact = calculateExactSplit(
          money,
          participants,
          equal.entries.map((e) => Money.fromMinor(e.amountMinor, code)),
        );
        expect(exact.entries.reduce((a, e) => a + e.amountMinor, 0)).toBe(total);
      }
    },
  );

  it('boundary: 1 minor unit across 6 participants in JPY/KWD still sums to 1', () => {
    for (const code of ['JPY', 'KWD'] as const) {
      const result = calculateEqualSplit(Money.fromMinor(1, code), MEMBERS);
      const sum = result.entries.reduce((acc, e) => acc + e.amountMinor, 0);
      expect(sum).toBe(1);
      // Remainder goes to the first sorted participant only.
      expect(result.entries.filter((e) => e.amountMinor === 1)).toHaveLength(1);
      expect(result.entries.filter((e) => e.amountMinor === 0)).toHaveLength(5);
    }
  });
});
