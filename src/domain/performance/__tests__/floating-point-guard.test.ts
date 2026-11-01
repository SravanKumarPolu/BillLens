import { describe, expect, it } from '@jest/globals';

import {
  addMinor,
  assertIntegerMinor,
  isSafeIntegerAmount,
  majorToMinorUnits,
  minorToMajorUnits,
  subtractMinor,
  sumMinor,
  verifyNoFloatingPointInBalances,
} from '../index';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('floating-point-guard', () => {
  describe('isSafeIntegerAmount', () => {
    it('returns true for 0', () => {
      expect(isSafeIntegerAmount(0)).toBe(true);
    });

    it('returns true for positive integers', () => {
      expect(isSafeIntegerAmount(1)).toBe(true);
      expect(isSafeIntegerAmount(100)).toBe(true);
      expect(isSafeIntegerAmount(1234567890)).toBe(true);
    });

    it('returns true for negative integers', () => {
      expect(isSafeIntegerAmount(-1)).toBe(true);
      expect(isSafeIntegerAmount(-100)).toBe(true);
      expect(isSafeIntegerAmount(-1234567890)).toBe(true);
    });

    it('returns true for MAX_SAFE_INTEGER', () => {
      expect(isSafeIntegerAmount(Number.MAX_SAFE_INTEGER)).toBe(true);
    });

    it('returns true for MIN_SAFE_INTEGER', () => {
      expect(isSafeIntegerAmount(Number.MIN_SAFE_INTEGER)).toBe(true);
    });

    it('CRITICAL: returns false for floating-point values', () => {
      expect(isSafeIntegerAmount(0.1)).toBe(false);
      expect(isSafeIntegerAmount(1.5)).toBe(false);
      expect(isSafeIntegerAmount(-1.5)).toBe(false);
      expect(isSafeIntegerAmount(100.001)).toBe(false);
      expect(isSafeIntegerAmount(0.1 + 0.2)).toBe(false); // 0.30000000000000004
    });

    it('CRITICAL: returns false for NaN', () => {
      expect(isSafeIntegerAmount(NaN)).toBe(false);
    });

    it('CRITICAL: returns false for Infinity', () => {
      expect(isSafeIntegerAmount(Infinity)).toBe(false);
      expect(isSafeIntegerAmount(-Infinity)).toBe(false);
    });

    it('CRITICAL: returns false for values outside the safe integer range', () => {
      expect(isSafeIntegerAmount(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
      expect(isSafeIntegerAmount(Number.MIN_SAFE_INTEGER - 1)).toBe(false);
    });

    it('returns false for non-number values', () => {
      expect(isSafeIntegerAmount('100' as unknown as number)).toBe(false);
      expect(isSafeIntegerAmount(null as unknown as number)).toBe(false);
      expect(isSafeIntegerAmount(undefined as unknown as number)).toBe(false);
      expect(isSafeIntegerAmount({} as unknown as number)).toBe(false);
    });
  });

  describe('assertIntegerMinor', () => {
    it('does not throw for safe integers', () => {
      expect(() => assertIntegerMinor(0)).not.toThrow();
      expect(() => assertIntegerMinor(100)).not.toThrow();
      expect(() => assertIntegerMinor(-100)).not.toThrow();
      expect(() => assertIntegerMinor(Number.MAX_SAFE_INTEGER)).not.toThrow();
    });

    it('CRITICAL: throws for floating-point values', () => {
      expect(() => assertIntegerMinor(0.1)).toThrow();
      expect(() => assertIntegerMinor(1.5)).toThrow();
      expect(() => assertIntegerMinor(-1.5)).toThrow();
    });

    it('throws for NaN', () => {
      expect(() => assertIntegerMinor(NaN)).toThrow();
    });

    it('throws for Infinity', () => {
      expect(() => assertIntegerMinor(Infinity)).toThrow();
      expect(() => assertIntegerMinor(-Infinity)).toThrow();
    });

    it('throws for non-safe-integer values', () => {
      expect(() => assertIntegerMinor(Number.MAX_SAFE_INTEGER + 1)).toThrow();
    });

    it('includes diagnostic information in the error message', () => {
      let caught: Error | null = null;
      try {
        assertIntegerMinor(1.5);
      } catch (e) {
        caught = e as Error;
      }
      expect(caught).not.toBe(null);
      expect(caught!.message).toContain('1.5');
      expect(caught!.message).toContain('safe integer');
    });
  });

  describe('verifyNoFloatingPointInBalances', () => {
    it('returns true when all balances are safe integers', () => {
      const balances = [
        { netBalanceMinor: 100 },
        { netBalanceMinor: -100 },
        { netBalanceMinor: 0 },
      ];
      expect(verifyNoFloatingPointInBalances(balances)).toBe(true);
    });

    it('returns true for an empty array', () => {
      expect(verifyNoFloatingPointInBalances([])).toBe(true);
    });

    it('CRITICAL: returns false when ANY balance is a float', () => {
      const balances = [
        { netBalanceMinor: 100 },
        { netBalanceMinor: -90.5 }, // float!
        { netBalanceMinor: -9.5 },
      ];
      expect(verifyNoFloatingPointInBalances(balances)).toBe(false);
    });

    it('CRITICAL: returns false when ANY balance is NaN', () => {
      const balances = [
        { netBalanceMinor: 100 },
        { netBalanceMinor: NaN },
      ];
      expect(verifyNoFloatingPointInBalances(balances)).toBe(false);
    });

    it('CRITICAL: returns false when ANY balance is Infinity', () => {
      const balances = [
        { netBalanceMinor: Infinity },
        { netBalanceMinor: -Infinity },
      ];
      expect(verifyNoFloatingPointInBalances(balances)).toBe(false);
    });

    it('returns false when the input is not an array', () => {
      expect(verifyNoFloatingPointInBalances('not-array' as unknown as never[])).toBe(false);
    });

    it('returns false when a balance is not an object', () => {
      const balances = [
        { netBalanceMinor: 100 },
        'not-an-object' as unknown as { netBalanceMinor: number },
      ];
      expect(verifyNoFloatingPointInBalances(balances)).toBe(false);
    });
  });

  describe('majorToMinorUnits', () => {
    it('converts whole major units to minor units', () => {
      expect(majorToMinorUnits(1)).toBe(100);
      expect(majorToMinorUnits(10)).toBe(1000);
      expect(majorToMinorUnits(100)).toBe(10000);
    });

    it('converts fractional major units (rounds correctly)', () => {
      expect(majorToMinorUnits(0.01)).toBe(1);
      expect(majorToMinorUnits(0.5)).toBe(50);
      expect(majorToMinorUnits(1.99)).toBe(199);
    });

    it('CRITICAL: always returns an integer (no floats)', () => {
      expect(Number.isInteger(majorToMinorUnits(0.1))).toBe(true);
      expect(Number.isInteger(majorToMinorUnits(0.2))).toBe(true);
      expect(Number.isInteger(majorToMinorUnits(1.23))).toBe(true);
    });

    it('handles negative amounts', () => {
      expect(majorToMinorUnits(-1)).toBe(-100);
      expect(majorToMinorUnits(-0.5)).toBe(-50);
    });

    it('throws for non-finite input', () => {
      expect(() => majorToMinorUnits(NaN)).toThrow();
      expect(() => majorToMinorUnits(Infinity)).toThrow();
    });

    it('throws for non-number input', () => {
      expect(() => majorToMinorUnits('100' as unknown as number)).toThrow();
    });

    it('CRITICAL: handles IEEE 754 rounding edge cases (0.1 + 0.2)', () => {
      // 0.1 + 0.2 in IEEE 754 = 0.30000000000000004. After * 100 = 30.000000000000004.
      // Math.round(30.000000000000004) = 30 (integer).
      const minor = majorToMinorUnits(0.1 + 0.2);
      expect(minor).toBe(30);
      expect(Number.isInteger(minor)).toBe(true);
    });
  });

  describe('minorToMajorUnits', () => {
    it('converts minor units to major units', () => {
      expect(minorToMajorUnits(100)).toBe(1);
      expect(minorToMajorUnits(1000)).toBe(10);
      expect(minorToMajorUnits(1)).toBe(0.01);
    });

    it('throws for non-integer minor input', () => {
      expect(() => minorToMajorUnits(1.5)).toThrow();
      expect(() => minorToMajorUnits(NaN)).toThrow();
    });

    it('handles negative amounts', () => {
      expect(minorToMajorUnits(-100)).toBe(-1);
    });
  });

  describe('addMinor', () => {
    it('adds two safe integers', () => {
      expect(addMinor(100, 200)).toBe(300);
      expect(addMinor(-100, 200)).toBe(100);
    });

    it('throws if either input is not a safe integer', () => {
      expect(() => addMinor(1.5, 100)).toThrow();
      expect(() => addMinor(100, 1.5)).toThrow();
      expect(() => addMinor(NaN, 100)).toThrow();
    });

    it('throws on overflow', () => {
      expect(() =>
        addMinor(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
      ).toThrow();
    });
  });

  describe('subtractMinor', () => {
    it('subtracts two safe integers', () => {
      expect(subtractMinor(300, 100)).toBe(200);
      expect(subtractMinor(100, 300)).toBe(-200);
    });

    it('throws if either input is not a safe integer', () => {
      expect(() => subtractMinor(1.5, 100)).toThrow();
      expect(() => subtractMinor(100, NaN)).toThrow();
    });

    it('throws on underflow', () => {
      expect(() =>
        subtractMinor(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
      ).toThrow();
    });
  });

  describe('sumMinor', () => {
    it('sums a list of safe integers', () => {
      expect(sumMinor([100, 200, 300])).toBe(600);
      expect(sumMinor([])).toBe(0);
      expect(sumMinor([-100, 100])).toBe(0);
    });

    it('throws if any element is not a safe integer', () => {
      expect(() => sumMinor([100, 1.5, 300])).toThrow();
      expect(() => sumMinor([100, NaN])).toThrow();
    });

    it('throws on overflow during summation', () => {
      const big = Number.MAX_SAFE_INTEGER / 2;
      expect(() => sumMinor([big, big, big])).toThrow();
    });

    it('CRITICAL: never produces a floating-point result', () => {
      const result = sumMinor([100, 200, 300, 400, 500]);
      expect(Number.isInteger(result)).toBe(true);
      expect(isSafeIntegerAmount(result)).toBe(true);
    });
  });

  describe('CRITICAL: floating-point rejection (exhaustive)', () => {
    // CRITICAL: verify the guard rejects ALL common floating-point values.

    it.each([
      0.1, 0.2, 0.3, 0.01, 0.99,
      1.5, 2.5, 3.14,
      -0.1, -1.5, -3.14,
      100.001, 99.999,
      NaN, Infinity, -Infinity,
      Number.MAX_SAFE_INTEGER + 1,
      Number.MIN_SAFE_INTEGER - 1,
    ])('isSafeIntegerAmount(%d) returns false', (value) => {
      expect(isSafeIntegerAmount(value)).toBe(false);
    });

    it.each([
      0.1, 0.2, 0.3, 0.01, 0.99,
      1.5, 2.5, 3.14,
      -0.1, -1.5, -3.14,
    ])('assertIntegerMinor(%d) throws', (value) => {
      expect(() => assertIntegerMinor(value)).toThrow();
    });

    it.each([0, 1, -1, 100, -100, 999999, -999999, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER])(
      'isSafeIntegerAmount(%d) returns true for safe integers',
      (value) => {
        expect(isSafeIntegerAmount(value)).toBe(true);
      },
    );
  });
});
