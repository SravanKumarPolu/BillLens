import { describe, expect, it } from '@jest/globals';

import { asMemberId } from '@domain/entities';
import { InvalidSplitError } from '@domain/errors';
import { Money } from '@domain/value-objects';

import { ItemSplitStrategy, calculateItemSplit } from '../item-split-strategy';
import type { ItemSplitLineItem } from '../item-split-strategy';

describe('ItemSplitStrategy', () => {
  const a = asMemberId('a');
  const b = asMemberId('b');
  const c = asMemberId('c');

  it('assigns each item to a single member', () => {
    const items: ItemSplitLineItem[] = [
      { id: 'i1', totalAmountMinor: 600, assignedMemberIds: [a] },
      { id: 'i2', totalAmountMinor: 400, assignedMemberIds: [b] },
    ];
    const result = new ItemSplitStrategy().calculate({
      totalAmount: Money.fromMinor(1000, 'INR'),
      participantIds: [a, b, c],
      lineItems: items,
    });
    expect(result.entries.map((e) => e.amountMinor)).toEqual([600, 400, 0]);
  });

  it('splits a single item across multiple members equally', () => {
    // Item of ₹300 assigned to 3 members → ₹100 each
    const items: ItemSplitLineItem[] = [
      { id: 'i1', totalAmountMinor: 300, assignedMemberIds: [a, b, c] },
    ];
    const result = calculateItemSplit(
      Money.fromMinor(300, 'INR'),
      [a, b, c],
      items,
    );
    expect(result.entries.map((e) => e.amountMinor)).toEqual([100, 100, 100]);
  });

  it('handles remainder when splitting item across members', () => {
    // Item of ₹10.00 (1000 minor) split across 3 → 333, 333, 334
    const items: ItemSplitLineItem[] = [
      { id: 'i1', totalAmountMinor: 1000, assignedMemberIds: [a, b, c] },
    ];
    const result = calculateItemSplit(
      Money.fromMinor(1000, 'INR'),
      [a, b, c],
      items,
    );
    expect(result.entries.map((e) => e.amountMinor)).toEqual([334, 333, 333]);
  });

  it('sums multiple items per member correctly', () => {
    const items: ItemSplitLineItem[] = [
      { id: 'i1', totalAmountMinor: 100, assignedMemberIds: [a] },
      { id: 'i2', totalAmountMinor: 200, assignedMemberIds: [a, b] }, // 100 each
      { id: 'i3', totalAmountMinor: 50, assignedMemberIds: [c] },
    ];
    const result = calculateItemSplit(
      Money.fromMinor(350, 'INR'),
      [a, b, c],
      items,
    );
    // a: 100 + 100 = 200
    // b: 100
    // c: 50
    expect(result.entries.map((e) => e.amountMinor)).toEqual([200, 100, 50]);
  });

  it('applies receipt-level tax proportionally across participants', () => {
    const items: ItemSplitLineItem[] = [
      { id: 'i1', totalAmountMinor: 1000, assignedMemberIds: [a] },
      { id: 'i2', totalAmountMinor: 3000, assignedMemberIds: [b] },
      // total items = 4000
    ];
    const result = calculateItemSplit(
      Money.fromMinor(4400, 'INR'), // items 4000 + tax 400
      [a, b, c],
      items,
      [{ type: 'tax', amountMinor: 400, label: 'GST' }],
    );
    // Tax proportional: a paid 1/4 of items = ₹100 tax; b paid 3/4 = ₹300 tax
    // a: 1000 + 100 = 1100
    // b: 3000 + 300 = 3300
    // c: 0 + 0 = 0 (no items, no tax share)
    expect(result.entries.map((e) => e.amountMinor)).toEqual([1100, 3300, 0]);
  });

  it('applies discount (negative charge) proportionally', () => {
    const items: ItemSplitLineItem[] = [
      { id: 'i1', totalAmountMinor: 1000, assignedMemberIds: [a] },
      { id: 'i2', totalAmountMinor: 1000, assignedMemberIds: [b] },
      // total items = 2000
    ];
    const result = calculateItemSplit(
      Money.fromMinor(1800, 'INR'), // items 2000 - discount 200
      [a, b],
      items,
      [{ type: 'discount', amountMinor: -200, label: 'Coupon' }],
    );
    // Discount proportional: a gets 100 off, b gets 100 off
    // a: 1000 - 100 = 900
    // b: 1000 - 100 = 900
    expect(result.entries.map((e) => e.amountMinor)).toEqual([900, 900]);
  });

  it('rejects empty line items', () => {
    expect(() =>
      calculateItemSplit(Money.fromMinor(1000, 'INR'), [a, b], []),
    ).toThrow(InvalidSplitError);
  });

  it('rejects item with no assigned members', () => {
    expect(() =>
      calculateItemSplit(
        Money.fromMinor(1000, 'INR'),
        [a, b],
        [{ id: 'i1', totalAmountMinor: 1000, assignedMemberIds: [] }],
      ),
    ).toThrow(InvalidSplitError);
  });

  it('rejects item assigned to unknown member', () => {
    const unknown = asMemberId('zzz');
    expect(() =>
      calculateItemSplit(
        Money.fromMinor(1000, 'INR'),
        [a, b],
        [{ id: 'i1', totalAmountMinor: 1000, assignedMemberIds: [unknown] }],
      ),
    ).toThrow(InvalidSplitError);
  });

  it('rejects items + charges not matching total', () => {
    const items: ItemSplitLineItem[] = [
      { id: 'i1', totalAmountMinor: 1000, assignedMemberIds: [a] },
    ];
    expect(() =>
      calculateItemSplit(
        Money.fromMinor(2000, 'INR'), // total != items (1000) + charges (0)
        [a, b],
        items,
      ),
    ).toThrow(InvalidSplitError);
  });

  it('rejects negative item total', () => {
    expect(() =>
      calculateItemSplit(
        Money.fromMinor(0, 'INR'),
        [a],
        [{ id: 'i1', totalAmountMinor: -100, assignedMemberIds: [a] }],
      ),
    ).toThrow();
  });

  it('rejects empty participants', () => {
    expect(() =>
      calculateItemSplit(
        Money.fromMinor(1000, 'INR'),
        [],
        [{ id: 'i1', totalAmountMinor: 1000, assignedMemberIds: [a] }],
      ),
    ).toThrow(InvalidSplitError);
  });

  it('handles multiple charges (tax + tip + service charge)', () => {
    const items: ItemSplitLineItem[] = [
      { id: 'i1', totalAmountMinor: 1000, assignedMemberIds: [a] },
      { id: 'i2', totalAmountMinor: 1000, assignedMemberIds: [b] },
    ];
    // Items total 2000
    // + tax 200, + tip 100, + service 100 = total 2400
    const result = calculateItemSplit(
      Money.fromMinor(2400, 'INR'),
      [a, b],
      items,
      [
        { type: 'tax', amountMinor: 200 },
        { type: 'tip', amountMinor: 100 },
        { type: 'service_charge', amountMinor: 100 },
      ],
    );
    // All charges proportional: a gets half, b gets half
    // a: 1000 + 100 + 50 + 50 = 1200
    // b: 1000 + 100 + 50 + 50 = 1200
    expect(result.entries.map((e) => e.amountMinor)).toEqual([1200, 1200]);
  });

  it('preserves total exactly for complex splits', () => {
    const items: ItemSplitLineItem[] = [
      { id: 'i1', totalAmountMinor: 333, assignedMemberIds: [a, b, c] },
      { id: 'i2', totalAmountMinor: 333, assignedMemberIds: [a, b] },
      { id: 'i3', totalAmountMinor: 334, assignedMemberIds: [a] },
    ];
    // Total items = 1000
    const result = calculateItemSplit(
      Money.fromMinor(1000, 'INR'),
      [a, b, c],
      items,
    );
    const sum = result.entries.reduce((acc, e) => acc + e.amountMinor, 0);
    expect(sum).toBe(1000);
  });

  it('handles 100% discount (all items free, equal charge distribution)', () => {
    // Items total 2000, discount -2000, total = 0
    // But total cannot be 0 per expense validation. Skip this test scenario.
    // Test charges-only-equal-distribution path with 0 items total instead:
    const freeItems: ItemSplitLineItem[] = [
      { id: 'i1', totalAmountMinor: 0, assignedMemberIds: [a] },
      { id: 'i2', totalAmountMinor: 0, assignedMemberIds: [b] },
    ];
    const result = calculateItemSplit(
      Money.fromMinor(100, 'INR'), // just a fixed delivery fee
      [a, b, c],
      freeItems,
      [{ type: 'delivery', amountMinor: 100 }],
    );
    // All items are 0, so charges distributed equally: 100/3 = 33 r 1
    // → [34, 33, 33]
    expect(result.entries.map((e) => e.amountMinor)).toEqual([34, 33, 33]);
  });
});
