/**
 * BentoGrid tests.
 *
 * Verifies the `computeBentoTileWidth` helper math (the half-width +
 * full-width rules) without needing a real React Native render. The
 * BentoGrid component is a thin wrapper around React Native's flex
 * layout, so a render snapshot would be brittle; the math is the
 * invariant we care about.
 */

import { describe, expect, it } from '@jest/globals';

import { computeBentoTileWidth } from '@presentation/design-system/components/BentoGrid';

describe('computeBentoTileWidth', () => {
  it('returns half-width-minus-gap for span=1', () => {
    // container=375, gap=12 → (375 - 12) / 2 = 181.5
    expect(computeBentoTileWidth(1, 375, 12)).toBe(181.5);
  });

  it('returns 100% for span=2', () => {
    expect(computeBentoTileWidth(2, 375, 12)).toBe('100%');
  });

  it('returns 0 when containerWidth is smaller than gap', () => {
    expect(computeBentoTileWidth(1, 10, 12)).toBe(0);
  });

  it('handles a tablet-wide container', () => {
    expect(computeBentoTileWidth(1, 768, 16)).toBe(376);
  });
});
