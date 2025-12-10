import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/typography';
import { normalizeAmount } from '../utils/mathUtils';

export interface SplitRatioInputProps {
  memberId: string;
  memberName: string;
  amount: number;
  totalAmount: number;
  onChange: (memberId: string, amount: number) => void;
  onRemove?: (memberId: string) => void;
  removable?: boolean;
  style?: ViewStyle;
  showPercentage?: boolean;
}

/**
 * SplitRatioInput Component
 * 
 * Input component for configuring custom expense splits.
 * Displays member name, amount input, percentage, and optional remove button.
 * Matches BillLens brand identity with clean, modern styling.
 */
const SplitRatioInput: React.FC<SplitRatioInputProps> = ({
  memberId,
  memberName,
  amount,
  totalAmount,
  onChange,
  onRemove,
  removable = false,
  style,
  showPercentage = true,
}) => {
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';
  const [inputValue, setInputValue] = useState(amount.toFixed(2));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    // Update input when amount prop changes (e.g., from normalization)
    setInputValue(amount.toFixed(2));
  }, [amount]);

  const percentage = totalAmount > 0 ? (amount / totalAmount) * 100 : 0;
  const styles = createStyles(colors, isFocused, isDark);

  const handleChange = (text: string) => {
    // Allow empty input for better UX
    if (text === '' || text === '.') {
      setInputValue(text);
      onChange(memberId, 0);
      return;
    }

    // Remove non-numeric characters except decimal point
    const cleaned = text.replace(/[^0-9.]/g, '');
    
    // Prevent multiple decimal points
    const parts = cleaned.split('.');
    const sanitized = parts.length > 2 
      ? parts[0] + '.' + parts.slice(1).join('')
      : cleaned;

    // Limit to 2 decimal places
    const decimalParts = sanitized.split('.');
    const limited = decimalParts.length > 1
      ? decimalParts[0] + '.' + decimalParts[1].slice(0, 2)
      : sanitized;

    setInputValue(limited);
    
    const numValue = parseFloat(limited) || 0;
    const normalized = normalizeAmount(numValue);
    onChange(memberId, normalized);
  };

  const handleBlur = () => {
    setIsFocused(false);
    // Ensure value is properly formatted on blur
    const numValue = parseFloat(inputValue) || 0;
    const normalized = normalizeAmount(numValue);
    setInputValue(normalized.toFixed(2));
    onChange(memberId, normalized);
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  return (
    <View style={[styles.container, style]}>
      <View style={styles.memberInfo}>
        <Text style={[styles.memberName, { color: colors.textPrimary }]} numberOfLines={1}>
          {memberName}
        </Text>
        {showPercentage && (
          <Text style={[styles.percentage, { color: colors.textSecondary }]}>
            {percentage.toFixed(1)}%
          </Text>
        )}
      </View>

      <View style={styles.inputContainer}>
        <Text style={[styles.currencySymbol, { color: colors.textSecondary }]}>₹</Text>
        <TextInput
          style={[styles.input, { color: colors.textPrimary }]}
          value={inputValue}
          onChangeText={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={colors.textSecondary}
          selectTextOnFocus
        />
      </View>

      {removable && onRemove && (
        <TouchableOpacity
          style={[styles.removeButton, { backgroundColor: colors.error + '20' }]}
          onPress={() => onRemove(memberId)}
          activeOpacity={0.7}
        >
          <Text style={[styles.removeButtonText, { color: colors.error }]}>×</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const createStyles = (colors: any, isFocused: boolean, isDark: boolean) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.surfaceCard,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: isFocused ? colors.primary : colors.borderSubtle,
    shadowColor: isFocused ? colors.primary : '#000',
    shadowOffset: { width: 0, height: isFocused ? 2 : 1 },
    shadowOpacity: isFocused ? 0.1 : 0.05,
    shadowRadius: isFocused ? 4 : 2,
    elevation: isFocused ? 2 : 1,
  },
  memberInfo: {
    flex: 1,
    marginRight: 12,
  },
  memberName: {
    ...typography.body,
    fontWeight: '500',
    marginBottom: 2,
  },
  percentage: {
    ...typography.captionSmall,
    fontSize: 11,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 100,
    borderWidth: 1,
    borderColor: isFocused ? colors.primary : 'transparent',
  },
  currencySymbol: {
    ...typography.body,
    fontWeight: '600',
    marginRight: 4,
  },
  input: {
    ...typography.body,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
    padding: 0,
    minWidth: 60,
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  removeButtonText: {
    ...typography.display,
    fontSize: 24,
    lineHeight: 24,
    fontWeight: '300',
  },
});

export default SplitRatioInput;
