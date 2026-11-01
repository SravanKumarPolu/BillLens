/**
 * Text — themed text primitive.
 *
 * Picks a `TextStyle` from the theme's typography tokens via `variant`, and
 * a colour from the theme's colour tokens via `color`. Callers never need
 * to pass raw font sizes or hex colours.
 *
 * Font scaling (Phase 6 accessibility):
 *   - Body/label/caption text scales with the user's OS font size with
 *     NO cap — full respect for accessibility preferences.
 *   - MONEY variants (`amountLarge` / `amountMedium` / `amountSmall`)
 *     default to `maxFontSizeMultiplier = 1.5`: amounts scale up to
 *     150% but no further, because an amount that wraps mid-figure
 *     ("₹1,2\n50") or clips its container is LESS readable, not more,
 *     for a low-vision user. Callers can override per-instance.
 */

import type { TextProps } from 'react-native';
import { Text as RNText } from 'react-native';

import { useTheme } from '../theme';
import type { TypographyTokens } from '../tokens';

export type TextVariant = keyof TypographyTokens;

export type TextColor =
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'onColor'
  | 'positive'
  | 'negative'
  | 'warning'
  | 'critical'
  | 'info';

export interface TextPropsExtended extends TextProps {
  readonly variant?: TextVariant;
  readonly color?: TextColor;
  /**
   * Cap on the OS font-size multiplier for this text. Defaults:
   * money variants → 1.5 (see file header); everything else →
   * undefined (uncapped, full user scaling).
   */
  readonly maxFontSizeMultiplier?: number | null;
}

/** Resolve a `TextColor` token name to a hex string from the theme. */
function resolveColor(theme: ReturnType<typeof useTheme>, color: TextColor): string {
  switch (color) {
    case 'primary':
      return theme.colors.textPrimary;
    case 'secondary':
      return theme.colors.textSecondary;
    case 'muted':
      return theme.colors.textMuted;
    case 'onColor':
      return theme.colors.textOnColor;
    case 'positive':
      return theme.colors.positive;
    case 'negative':
      return theme.colors.negative;
    case 'warning':
      return theme.colors.warning;
    case 'critical':
      return theme.colors.critical;
    case 'info':
      return theme.colors.info;
  }
}

/** Default font-scale caps by variant (see file header for rationale). */
const AMOUNT_VARIANTS = new Set<TextVariant>(['amountLarge', 'amountMedium', 'amountSmall']);
const AMOUNT_SCALE_CAP = 1.5;

export function Text({
  variant = 'body',
  color = 'primary',
  maxFontSizeMultiplier,
  style,
  ...rest
}: TextPropsExtended): JSX.Element {
  const theme = useTheme();
  const textStyle = theme.typography[variant];
  const resolvedColor = resolveColor(theme, color);

  // `null` = explicit "no cap"; undefined = variant default.
  const scaleCap =
    maxFontSizeMultiplier === undefined
      ? AMOUNT_VARIANTS.has(variant)
        ? AMOUNT_SCALE_CAP
        : undefined
      : maxFontSizeMultiplier === null
        ? undefined
        : maxFontSizeMultiplier;

  return (
    <RNText
      style={[textStyle, { color: resolvedColor }, style]}
      maxFontSizeMultiplier={scaleCap}
      {...rest}
    />
  );
}
