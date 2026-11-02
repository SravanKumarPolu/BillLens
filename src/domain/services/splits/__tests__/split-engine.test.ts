import { describe, expect, it } from '@jest/globals';

import { asMemberId } from '@domain/entities';
import { InvalidSplitError } from '@domain/errors';
import { Money } from '@domain/value-objects';

import { SplitEngine, calculateSplit } from '../index';

describe('SplitEngine unified dispatcher', () => {
  const a = asMemberId('a');
  const b = asMemberId('b');
  const c = asMemberId('c');

  it('dispatches to equal split', () => {
    const result = SplitEngine.equal({
      totalAmount: Money.fromMinor(900, 'INR'),
      participantIds: [a, b, c],
    });
    expect(result.splitType).toBe('equal');
    expect(result.entries.map((e) => e.amountMinor)).toEqual([300, 300, 300]);
  });

  it('dispatches to exact split', () => {
    const result = SplitEngine.exact({
      totalAmount: Money.fromMinor(1000, 'INR'),
      participantIds: [a, b],
      amounts: [Money.fromMinor(600, 'INR'), Money.fromMinor(400, 'INR')],
    });
    expect(result.splitType).toBe('exact');
  });

  it('dispatches to percentage split', () => {
    const result = SplitEngine.percentage({
      totalAmount: Money.fromMinor(100000, 'INR'),
      participantIds: [a, b],
      basisPoints: [6000, 4000],
    });
    expect(result.splitType).toBe('percentage');
  });

  it('dispatches to share split', () => {
    const result = SplitEngine.shares({
      totalAmount: Money.fromMinor(30000, 'INR'),
      participantIds: [a, b, c],
      shareUnits: [1, 1, 2],
    });
    expect(result.splitType).toBe('shares');
  });

  it('dispatches to item split', () => {
    const result = SplitEngine.items({
      totalAmount: Money.fromMinor(1000, 'INR'),
      participantIds: [a, b],
      lineItems: [
        { id: 'i1', totalAmountMinor: 600, assignedMemberIds: [a] },
        { id: 'i2', totalAmountMinor: 400, assignedMemberIds: [b] },
      ],
    });
    expect(result.splitType).toBe('items');
  });

  describe('calculateSplit dispatch function', () => {
    it('dispatches equal', () => {
      const result = calculateSplit({
        totalAmount: Money.fromMinor(900, 'INR'),
        participantIds: [a, b, c],
        splitType: 'equal',
      });
      expect(result.splitType).toBe('equal');
    });

    it('dispatches exact', () => {
      const result = calculateSplit({
        totalAmount: Money.fromMinor(1000, 'INR'),
        participantIds: [a, b],
        splitType: 'exact',
        exactAmounts: [Money.fromMinor(600, 'INR'), Money.fromMinor(400, 'INR')],
      });
      expect(result.splitType).toBe('exact');
    });

    it('throws if exactAmounts is missing', () => {
      expect(() =>
        calculateSplit({
          totalAmount: Money.fromMinor(1000, 'INR'),
          participantIds: [a, b],
          splitType: 'exact',
        }),
      ).toThrow(InvalidSplitError);
    });

    it('dispatches percentage', () => {
      const result = calculateSplit({
        totalAmount: Money.fromMinor(100000, 'INR'),
        participantIds: [a, b],
        splitType: 'percentage',
        basisPoints: [6000, 4000],
      });
      expect(result.splitType).toBe('percentage');
    });

    it('throws if basisPoints is missing', () => {
      expect(() =>
        calculateSplit({
          totalAmount: Money.fromMinor(100000, 'INR'),
          participantIds: [a, b],
          splitType: 'percentage',
        }),
      ).toThrow(InvalidSplitError);
    });

    it('dispatches shares', () => {
      const result = calculateSplit({
        totalAmount: Money.fromMinor(30000, 'INR'),
        participantIds: [a, b, c],
        splitType: 'shares',
        shareUnits: [1, 1, 2],
      });
      expect(result.splitType).toBe('shares');
    });

    it('throws if shareUnits is missing', () => {
      expect(() =>
        calculateSplit({
          totalAmount: Money.fromMinor(30000, 'INR'),
          participantIds: [a, b, c],
          splitType: 'shares',
        }),
      ).toThrow(InvalidSplitError);
    });

    it('dispatches items', () => {
      const result = calculateSplit({
        totalAmount: Money.fromMinor(1000, 'INR'),
        participantIds: [a, b],
        splitType: 'items',
        lineItems: [
          { id: 'i1', totalAmountMinor: 600, assignedMemberIds: [a] },
          { id: 'i2', totalAmountMinor: 400, assignedMemberIds: [b] },
        ],
      });
      expect(result.splitType).toBe('items');
    });

    it('throws if lineItems is missing', () => {
      expect(() =>
        calculateSplit({
          totalAmount: Money.fromMinor(1000, 'INR'),
          participantIds: [a, b],
          splitType: 'items',
        }),
      ).toThrow(InvalidSplitError);
    });
  });

  describe('Total preservation invariant across all strategies', () => {
    const cases = [
      {
        name: 'equal',
        run: () =>
          SplitEngine.equal({
            totalAmount: Money.fromMinor(1000, 'INR'),
            participantIds: [a, b, c],
          }),
      },
      {
        name: 'exact',
        run: () =>
          SplitEngine.exact({
            totalAmount: Money.fromMinor(1000, 'INR'),
            participantIds: [a, b, c],
            amounts: [
              Money.fromMinor(500, 'INR'),
              Money.fromMinor(300, 'INR'),
              Money.fromMinor(200, 'INR'),
            ],
          }),
      },
      {
        name: 'percentage',
        run: () =>
          SplitEngine.percentage({
            totalAmount: Money.fromMinor(1000, 'INR'),
            participantIds: [a, b, c],
            basisPoints: [3333, 3333, 3334],
          }),
      },
      {
        name: 'shares',
        run: () =>
          SplitEngine.shares({
            totalAmount: Money.fromMinor(1000, 'INR'),
            participantIds: [a, b, c],
            shareUnits: [1, 1, 2],
          }),
      },
      {
        name: 'items',
        run: () =>
          SplitEngine.items({
            totalAmount: Money.fromMinor(1000, 'INR'),
            participantIds: [a, b, c],
            lineItems: [
              { id: 'i1', totalAmountMinor: 600, assignedMemberIds: [a, b] },
              { id: 'i2', totalAmountMinor: 400, assignedMemberIds: [c] },
            ],
          }),
      },
    ];

    for (const { name, run } of cases) {
      it(`${name}: Σ entries = total`, () => {
        const result = run();
        const sum = result.entries.reduce((acc, e) => acc + e.amountMinor, 0);
        expect(sum).toBe(result.totalAmountMinor);
      });
    }
  });
});
