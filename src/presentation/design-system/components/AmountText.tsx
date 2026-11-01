/**
 * AmountText — renders a financial amount with sign convention.
 *
 * Accessibility: the sign is conveyed through (a) a leading minus for
 * negatives, (b) a semantic colour (positive/negative/neutral), and
 * (c) an optional label ("You are owed" / "You owe" / "Settled"). Colour is
 * never the sole signal — see `docs/money-and-rounding.md`.
 */

import { View } from 'react-native';

import { formatAmount } from '../financial-format';
import type { FinancialSign } from '../financial-format';
import { useTheme } from '../theme';
import type { TypographyTokens } from '../tokens';

import { Text } from './Text';

export type AmountVariant = 'amountLarge' | 'amountMedium' | 'amountSmall';

export interface AmountTextProps {
  /** Amount in integer minor units (e.g. cents, paise). Negative = owed. */
  readonly amountMinor: number;
  readonly currencyCode: string;
  readonly variant?: AmountVariant;
  /** Show the plain-language label below the amount. */
  readonly showLabel?: boolean;
  /** Prefix the amount with the currency symbol. Default true. */
  readonly showCurrencySymbol?: boolean;
  /** Prefix negative amounts with a minus sign. Default true. */
  readonly showSign?: boolean;
  /** Accessibility label override. Defaults to a spoken description. */
  readonly accessibilityLabel?: string;
}

function signToColor(sign: FinancialSign): 'positive' | 'negative' | 'secondary' {
  switch (sign) {
    case 'positive':
      return 'positive';
    case 'negative':
      return 'negative';
    case 'zero':
      return 'secondary';
  }
}

export function AmountText({
  amountMinor,
  currencyCode,
  variant = 'amountMedium',
  showLabel = false,
  showCurrencySymbol = true,
  showSign = true,
  accessibilityLabel,
}: AmountTextProps): JSX.Element {
  const theme = useTheme();
  const formatted = formatAmount(amountMinor, currencyCode);
  const color = signToColor(formatted.sign);

  const signPrefix = showSign && formatted.sign === 'negative' ? '−' : '';
  const symbol = showCurrencySymbol ? formatted.currencySymbol : '';
  const display = `${signPrefix}${symbol}${formatted.formattedMinor}`;

  const a11yLabel =
    accessibilityLabel ??
    `${formatted.label} ${symbol}${formatted.formattedMinor} ${currencyCode}`;

  return (
    <View accessibilityLabel={a11yLabel} accessibilityRole="text">
      <Text variant={variant satisfies keyof TypographyTokens} color={color}>
        {display}
      </Text>
      {showLabel ? (
        <Text variant="caption" color="muted" style={{ marginTop: theme.spacing.xs }}>
          {formatted.label}
        </Text>
      ) : null}
    </View>
  );
}
