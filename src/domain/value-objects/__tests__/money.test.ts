import { describe, expect, it } from '@jest/globals';

import { CurrencyMismatchError, InvalidMoneyError } from '../../errors/index';
import { Money, asCurrencyCode } from '../../value-objects/index';

describe('Money', () => {
  describe('fromMinor', () => {
    it('creates Money from a positive integer', () => {
      const m = Money.fromMinor(125050, asCurrencyCode('INR'));
      expect(m.toMinor()).toBe(125050);
      expect(m.getCurrency()).toBe('INR');
    });

    it('accepts zero', () => {
      const m = Money.fromMinor(0, 'USD' as never);
      expect(m.isZero()).toBe(true);
    });

    it('accepts negative amounts (for debt representation)', () => {
      const m = Money.fromMinor(-500, 'USD' as never);
      expect(m.isNegative()).toBe(true);
    });

    it('rejects NaN', () => {
      expect(() => Money.fromMinor(NaN, 'USD' as never)).toThrow(InvalidMoneyError);
    });

    it('rejects Infinity', () => {
      expect(() => Money.fromMinor(Infinity, 'USD' as never)).toThrow(InvalidMoneyError);
    });

    it('rejects -Infinity', () => {
      expect(() => Money.fromMinor(-Infinity, 'USD' as never)).toThrow(InvalidMoneyError);
    });

    it('rejects non-integer values', () => {
      expect(() => Money.fromMinor(1250.5, 'USD' as never)).toThrow(InvalidMoneyError);
    });

    it('rejects unsafe integers', () => {
      const unsafe = Number.MAX_SAFE_INTEGER + 1;
      expect(() => Money.fromMinor(unsafe, 'USD' as never)).toThrow(InvalidMoneyError);
    });

    it('accepts string currency', () => {
      const m = Money.fromMinor(1000, 'INR');
      expect(m.getCurrency()).toBe('INR');
    });

    it('rejects invalid currency code format', () => {
      expect(() => Money.fromMinor(1000, 'IN')).toThrow();
      expect(() => Money.fromMinor(1000, 'inr')).toThrow();
    });
  });

  describe('fromMajor', () => {
    it('converts major decimal to minor integer', () => {
      const m = Money.fromMajor(1250.5, 'INR');
      expect(m.toMinor()).toBe(125050);
    });

    it('rounds half up based on the third decimal digit', () => {
      // 0.005 → 0.01 (round half up) → 1 minor unit
      const m = Money.fromMajor(0.005, 'INR');
      expect(m.toMinor()).toBe(1);
    });

    it('avoids floating-point precision loss', () => {
      // 1.005 * 100 in IEEE 754 is 100.49999999999999, which Math.round
      // would round down to 100. The string-based parser must yield 101.
      const m = Money.fromMajor(1.005, 'INR');
      expect(m.toMinor()).toBe(101);
    });

    it('handles negative amounts correctly', () => {
      const m = Money.fromMajor(-12.5, 'INR');
      expect(m.toMinor()).toBe(-1250);
    });

    it('handles integer major amounts', () => {
      const m = Money.fromMajor(10, 'INR');
      expect(m.toMinor()).toBe(1000);
    });

    it('rejects non-finite', () => {
      expect(() => Money.fromMajor(NaN, 'INR')).toThrow(InvalidMoneyError);
      expect(() => Money.fromMajor(Infinity, 'INR')).toThrow(InvalidMoneyError);
    });

    it('fromMajor respects JPY 0 decimal places', () => {
      // JPY has 0 decimal places, so 1000 major = 1000 minor (not 100000).
      const m = Money.fromMajor(1000, 'JPY');
      expect(m.toMinor()).toBe(1000);
    });

    it('fromMajor round-trips with toMajor for JPY (0 decimals)', () => {
      const m = Money.fromMajor(100, 'JPY');
      expect(m.toMinor()).toBe(100);
      expect(m.toMajor()).toBe(100); // 100 / 10^0 = 100
    });

    it('fromMajor rounds half-up correctly for JPY', () => {
      // 0.5 major with 0 decimals → round half-up to 1 minor unit.
      expect(Money.fromMajor(0.5, 'JPY').toMinor()).toBe(1);
      // 0.4 major with 0 decimals → round down to 0.
      expect(Money.fromMajor(0.4, 'JPY').toMinor()).toBe(0);
    });

    it('fromMajor defaults to 2 decimals for unsupported currencies', () => {
      // XYZ is not in SUPPORTED_CURRENCIES but is a valid format → defaults to 2.
      const m = Money.fromMajor(10.5, 'XYZ');
      expect(m.toMinor()).toBe(1050);
    });
  });

  describe('zero', () => {
    it('creates a zero-value Money', () => {
      const m = Money.zero('INR' as never);
      expect(m.toMinor()).toBe(0);
      expect(m.isZero()).toBe(true);
    });
  });

  describe('sum', () => {
    it('sums same-currency values', () => {
      const a = Money.fromMinor(100, 'INR');
      const b = Money.fromMinor(200, 'INR');
      const c = Money.fromMinor(300, 'INR');
      expect(Money.sum([a, b, c])?.toMinor()).toBe(600);
    });

    it('returns null for an empty list', () => {
      expect(Money.sum([])).toBeNull();
    });

    it('throws on mixed currencies', () => {
      const a = Money.fromMinor(100, 'INR');
      const b = Money.fromMinor(200, 'USD');
      expect(() => Money.sum([a, b])).toThrow(CurrencyMismatchError);
    });
  });

  describe('add', () => {
    it('adds same-currency values', () => {
      const a = Money.fromMinor(100, 'INR');
      const b = Money.fromMinor(50, 'INR');
      expect(a.add(b).toMinor()).toBe(150);
    });

    it('throws on different currencies', () => {
      const a = Money.fromMinor(100, 'INR');
      const b = Money.fromMinor(50, 'USD');
      expect(() => a.add(b)).toThrow(CurrencyMismatchError);
    });
  });

  describe('subtract', () => {
    it('subtracts same-currency values', () => {
      const a = Money.fromMinor(100, 'INR');
      const b = Money.fromMinor(30, 'INR');
      expect(a.subtract(b).toMinor()).toBe(70);
    });

    it('throws on different currencies', () => {
      const a = Money.fromMinor(100, 'INR');
      const b = Money.fromMinor(30, 'USD');
      expect(() => a.subtract(b)).toThrow(CurrencyMismatchError);
    });
  });

  describe('multiply', () => {
    it('multiplies by a positive integer', () => {
      expect(Money.fromMinor(100, 'INR').multiply(3).toMinor()).toBe(300);
    });

    it('multiplies by zero', () => {
      expect(Money.fromMinor(100, 'INR').multiply(0).toMinor()).toBe(0);
    });

    it('rejects negative factor', () => {
      expect(() => Money.fromMinor(100, 'INR').multiply(-1)).toThrow(InvalidMoneyError);
    });

    it('rejects non-integer factor', () => {
      expect(() => Money.fromMinor(100, 'INR').multiply(1.5)).toThrow(InvalidMoneyError);
    });
  });

  describe('divide', () => {
    it('divides evenly', () => {
      const { quotient, remainder } = Money.fromMinor(900, 'INR').divide(3);
      expect(quotient.toMinor()).toBe(300);
      expect(remainder).toBe(0);
    });

    it('divides with remainder', () => {
      const { quotient, remainder } = Money.fromMinor(1000, 'INR').divide(3);
      expect(quotient.toMinor()).toBe(333);
      expect(remainder).toBe(1);
    });

    it('rejects zero divisor', () => {
      expect(() => Money.fromMinor(100, 'INR').divide(0)).toThrow(InvalidMoneyError);
    });

    it('rejects negative divisor', () => {
      expect(() => Money.fromMinor(100, 'INR').divide(-1)).toThrow(InvalidMoneyError);
    });

    it('rejects non-integer divisor', () => {
      expect(() => Money.fromMinor(100, 'INR').divide(1.5)).toThrow(InvalidMoneyError);
    });
  });

  describe('allocate', () => {
    it('allocates evenly when divisible', () => {
      const shares = Money.fromMinor(900, 'INR').allocate(3);
      expect(shares.map((s) => s.toMinor())).toEqual([300, 300, 300]);
      expect(Money.sum(shares)?.toMinor()).toBe(900);
    });

    it('distributes remainder to earliest indices', () => {
      // 1000 / 3 = 333 r 1 → first index gets 334
      const shares = Money.fromMinor(1000, 'INR').allocate(3);
      expect(shares.map((s) => s.toMinor())).toEqual([334, 333, 333]);
      expect(Money.sum(shares)?.toMinor()).toBe(1000);
    });

    it('always preserves total exactly', () => {
      // Edge case: ₹1 split between 3 people
      const shares = Money.fromMinor(1, 'INR').allocate(3);
      expect(shares.map((s) => s.toMinor())).toEqual([1, 0, 0]);
      expect(Money.sum(shares)?.toMinor()).toBe(1);
    });

    it('handles single recipient', () => {
      const shares = Money.fromMinor(500, 'INR').allocate(1);
      expect(shares.map((s) => s.toMinor())).toEqual([500]);
    });

    it('rejects zero count', () => {
      expect(() => Money.fromMinor(100, 'INR').allocate(0)).toThrow(InvalidMoneyError);
    });
  });

  describe('allocateByWeights', () => {
    it('allocates proportionally by integer weights', () => {
      const shares = Money.fromMinor(1000, 'INR').allocateByWeights([1, 1, 2]);
      // Total weight 4 → 250, 250, 500
      expect(shares.map((s) => s.toMinor())).toEqual([250, 250, 500]);
      expect(Money.sum(shares)?.toMinor()).toBe(1000);
    });

    it('distributes remainder deterministically', () => {
      // 1000 / 3 weights = 333.33 each → floor 333, remainder 1
      const shares = Money.fromMinor(1000, 'INR').allocateByWeights([1, 1, 1]);
      expect(shares.map((s) => s.toMinor())).toEqual([334, 333, 333]);
      expect(Money.sum(shares)?.toMinor()).toBe(1000);
    });

    it('preserves total with awkward weights', () => {
      // 100 allocated by weights [3, 3, 1] → floor 37, 37, 14 = 88; remainder 12
      // Remainders: 100*3=300 % 7 = 6; 100*3=300 % 7 = 6; 100*1=100 % 7 = 2.
      // Leftover = 12. Distribute to indices with largest remainder, tie-break
      // by index ascending → first two indices get +1 each... only 12 leftover
      // units but max 2 to distribute? Actually leftover = 100 - 88 = 12, but
      // we can distribute at most one per index (only 3 indices). Wait, no —
      // we can distribute as many as leftover, one per sorted slot but limited
      // to sorted.length iterations. Let me re-examine.
      // Actually: leftover = 12, sorted.length = 3 → distribute 3, leftover 9.
      // Hmm, that means we'd lose 9 minor units. That can't be right.
      // Actually re-reading the algorithm: the for loop distributes at most
      // `sorted.length` units. For this test to be meaningful, use a smaller
      // amount where leftover <= weights.length.
      const shares = Money.fromMinor(100, 'INR').allocateByWeights([3, 3, 1]);
      // 100 with weights [3,3,1], total 7. floor(300/7)=42, floor(300/7)=42,
      // floor(100/7)=14. Allocated = 98, leftover = 2.
      // Remainders: 300%7=6, 300%7=6, 100%7=2. Largest are both 6 (indices 0,1).
      // Tie-break by index ascending → +1 to index 0, then +1 to index 1.
      expect(shares.map((s) => s.toMinor())).toEqual([43, 43, 14]);
      expect(Money.sum(shares)?.toMinor()).toBe(100);
    });

    it('rejects empty weights', () => {
      expect(() => Money.fromMinor(100, 'INR').allocateByWeights([])).toThrow(InvalidMoneyError);
    });

    it('rejects non-positive weights', () => {
      expect(() => Money.fromMinor(100, 'INR').allocateByWeights([0, 1])).toThrow(InvalidMoneyError);
      expect(() => Money.fromMinor(100, 'INR').allocateByWeights([-1, 1])).toThrow(InvalidMoneyError);
    });

    it('rejects non-integer weights', () => {
      expect(() => Money.fromMinor(100, 'INR').allocateByWeights([1.5, 1])).toThrow(InvalidMoneyError);
    });

    it('rejects overflow of amountMinor * weight', () => {
      // MAX_SAFE_INTEGER * 2 exceeds the safe integer range.
      const huge = Money.fromMinor(Number.MAX_SAFE_INTEGER, 'INR');
      expect(() => huge.allocateByWeights([2, 1])).toThrow(InvalidMoneyError);
    });
  });

  describe('toMajor respects decimal places', () => {
    it('divides by 100 for 2-decimal currencies (INR)', () => {
      expect(Money.fromMinor(125050, 'INR').toMajor()).toBe(1250.5);
    });

    it('returns the minor amount for 0-decimal currencies (JPY)', () => {
      expect(Money.fromMinor(1000, 'JPY').toMajor()).toBe(1000);
    });

    it('defaults to 2 decimal places for unknown currencies', () => {
      // XYZ is not in the supported list but is a valid format.
      expect(Money.fromMinor(1000, 'XYZ').toMajor()).toBe(10);
    });
  });

  describe('comparison', () => {
    it('equals same value and currency', () => {
      expect(Money.fromMinor(100, 'INR').equals(Money.fromMinor(100, 'INR'))).toBe(true);
    });

    it('not equals different value', () => {
      expect(Money.fromMinor(100, 'INR').equals(Money.fromMinor(200, 'INR'))).toBe(false);
    });

    it('not equals different currency', () => {
      expect(Money.fromMinor(100, 'INR').equals(Money.fromMinor(100, 'USD'))).toBe(false);
    });

    it('isGreaterThan', () => {
      expect(Money.fromMinor(200, 'INR').isGreaterThan(Money.fromMinor(100, 'INR'))).toBe(true);
      expect(() => Money.fromMinor(200, 'INR').isGreaterThan(Money.fromMinor(100, 'USD'))).toThrow(CurrencyMismatchError);
    });

    it('isLessThan', () => {
      expect(Money.fromMinor(100, 'INR').isLessThan(Money.fromMinor(200, 'INR'))).toBe(true);
    });

    it('isPositive / isNegative / isZero', () => {
      expect(Money.fromMinor(100, 'INR').isPositive()).toBe(true);
      expect(Money.fromMinor(-100, 'INR').isNegative()).toBe(true);
      expect(Money.fromMinor(0, 'INR').isZero()).toBe(true);
    });
  });

  describe('toString / toJSON', () => {
    it('toString returns "<amount> <currency>"', () => {
      expect(Money.fromMinor(125050, 'INR').toString()).toBe('125050 INR');
    });

    it('toJSON returns serializable object', () => {
      expect(Money.fromMinor(125050, 'INR').toJSON()).toEqual({
        amountMinor: 125050,
        currency: 'INR',
      });
    });
  });

  describe('real-world scenarios', () => {
    it('₹10 split between 3 people', () => {
      const total = Money.fromMinor(1000, 'INR'); // ₹10.00
      const shares = total.allocate(3);
      expect(Money.sum(shares)?.toMinor()).toBe(1000);
      expect(shares.map((s) => s.toMinor())).toEqual([334, 333, 333]);
    });

    it('₹1 split between 3 people (edge case)', () => {
      const total = Money.fromMinor(1, 'INR'); // ₹0.01
      const shares = total.allocate(3);
      expect(Money.sum(shares)?.toMinor()).toBe(1);
      // Only the first recipient gets the 1 minor unit
      expect(shares.map((s) => s.toMinor())).toEqual([1, 0, 0]);
    });

    it('large safe integer value', () => {
      const large = Number.MAX_SAFE_INTEGER - 1;
      const m = Money.fromMinor(large, 'INR');
      expect(m.toMinor()).toBe(large);
    });
  });
});
