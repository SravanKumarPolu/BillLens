import React from 'react';
import { Text, StyleSheet, TextStyle } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { formatMoney } from '../utils/formatMoney';

export type MoneySize = 'small' | 'medium' | 'large';

export interface MoneyDisplayProps {
  amount: number;
  size?: MoneySize;
  showPositive?: boolean; // Show + prefix for positive amounts
  color?: string;
  style?: TextStyle;
}

const MoneyDisplay: React.FC<MoneyDisplayProps> = ({
  amount,
  size = 'medium',
  showPositive = false,
  color,
  style,
}) => {
  const formatted = formatMoney(amount, showPositive);
  const isPositive = amount > 0;
  const isNegative = amount < 0;

  // Determine color based on amount if not explicitly provided
  let textColor = color || colors.textPrimary;
  if (!color) {
    if (isPositive) {
      textColor = colors.accent; // Green for positive
    } else if (isNegative) {
      textColor = colors.error; // Red for negative
    }
  }

  const textStyle = [
    styles.base,
    styles[size],
    { color: textColor },
    style,
  ];

  return <Text style={textStyle}>{formatted}</Text>;
};

const styles = StyleSheet.create({
  base: {
    fontWeight: '600',
  },
  small: {
    ...typography.body,
  },
  medium: {
    ...typography.money,
  },
  large: {
    ...typography.moneyLarge,
  },
});

export default MoneyDisplay;

