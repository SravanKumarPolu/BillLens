/**
 * Text primitive — font-scaling behaviour (Phase 6 accessibility).
 *
 * Verifies the `maxFontSizeMultiplier` contract:
 *   - money variants (amountLarge / amountMedium / amountSmall) default
 *     to a 1.5x cap — an amount that wraps mid-figure is harder to
 *     verify, so it scales less but never breaks;
 *   - non-money variants have NO default cap (full user scaling);
 *   - explicit props override the defaults in both directions,
 *     including `null` to force "no cap" on a money variant.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import { Text } from '../components/Text';
import { lightTheme } from '../theme';

describe('Text — font scaling (Phase 6)', () => {
  it('caps money variants at 1.5x by default', () => {
    for (const variant of ['amountLarge', 'amountMedium', 'amountSmall'] as const) {
      const { UNSAFE_getByProps } = render(<Text variant={variant}>₹1,250.50</Text>);
      // The themed wrapper renders exactly one internal RN Text that
      // carries the resolved maxFontSizeMultiplier prop.
      expect(UNSAFE_getByProps({ maxFontSizeMultiplier: 1.5 })).toBeTruthy();
    }
  });

  it('does NOT cap body variants by default (full user scaling)', () => {
    const { UNSAFE_getByProps } = render(<Text variant="body">hello</Text>);
    // No cap prop present on the internal text node.
    expect(() => UNSAFE_getByProps({ maxFontSizeMultiplier: 1.5 })).toThrow();
  });

  it('does not cap caption / label / title variants either', () => {
    for (const variant of ['caption', 'label', 'sectionTitle', 'screenTitle'] as const) {
      const { UNSAFE_getByProps } = render(<Text variant={variant}>hello</Text>);
      expect(() => UNSAFE_getByProps({ maxFontSizeMultiplier: 1.5 })).toThrow();
    }
  });

  it('honours an explicit multiplier override', () => {
    const { UNSAFE_getByProps } = render(
      <Text variant="body" maxFontSizeMultiplier={2}>
        hello
      </Text>,
    );
    expect(UNSAFE_getByProps({ maxFontSizeMultiplier: 2 })).toBeTruthy();
  });

  it('null means "no cap" even for money variants', () => {
    const { UNSAFE_getByProps } = render(
      <Text variant="amountMedium" maxFontSizeMultiplier={null}>
        ₹1.00
      </Text>,
    );
    expect(() => UNSAFE_getByProps({ maxFontSizeMultiplier: 1.5 })).toThrow();
  });

  it('fires onPress through the themed wrapper (interaction parity)', () => {
    const handlePress = jest.fn();
    const { getByText } = render(<Text onPress={handlePress}>tap me</Text>);
    fireEvent.press(getByText('tap me'));
    expect(handlePress).toHaveBeenCalledTimes(1);
  });

  it('typography tokens define all three amount variants (cap keying guard)', () => {
    expect(lightTheme.typography.amountLarge).toBeDefined();
    expect(lightTheme.typography.amountMedium).toBeDefined();
    expect(lightTheme.typography.amountSmall).toBeDefined();
  });
});
