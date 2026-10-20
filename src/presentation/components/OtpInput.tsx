/**
 * OtpInput — six-digit verification code input.
 *
 * Renders six separate single-digit `TextInput` boxes. Behaviour:
 *
 *   - Auto-focus the first box on mount.
 *   - Auto-advance focus to the next box when a digit is entered.
 *   - Backspace: if the current box is empty, move focus to the
 *     previous box and clear it; if it has a digit, clear the digit
 *     in place.
 *   - Paste: when the user pastes text into any box, distribute the
 *     digits across the boxes (first six digits only; non-digits are
 *     ignored). Useful for SMS autofill and copy-paste from email.
 *   - The full code is exposed to the parent via `onCodeChange`.
 *   - Themed: uses design-system colours and typography tokens.
 *
 * SECURITY: the component NEVER logs the code values. The
 * `accessibilityLabel` for each box names only its position
 * ("Verification code digit 1") — never the digit itself.
 *
 * Accessibility:
 *   - Each box has `accessibilityLabel="Verification code digit N"`.
 *   - The container is marked `accessibilityRole="group"` with a
 *     single label describing the purpose.
 *   - `keyboardType="number-pad"` and `textContentType="oneTimeCode"`
 *     enable iOS SMS autofill.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { TextInput as RNTextInput, StyleSheet, View } from 'react-native';

import { useTheme } from '@presentation/design-system/theme';
import { borderRadius, spacing, touchTargets } from '@presentation/design-system/tokens';

export const OTP_LENGTH = 6;

export interface OtpInputProps {
  /**
   * Called whenever the code changes. Receives the full 6-character
   * string (digits only), padded with empty strings for unfilled
   * positions.
   */
  readonly onCodeChange: (code: string) => void;
  /** Optional code setter — useful for clearing the input after submit. */
  readonly value?: string;
  /** Disable all boxes (e.g. while submitting). */
  readonly disabled?: boolean;
  /** Auto-focus the first box on mount (default true). */
  readonly autoFocus?: boolean;
  /** Override the accessible label of the group. */
  readonly accessibilityLabel?: string;
  /** Called when the user presses Enter on the last box. */
  readonly onComplete?: (code: string) => void;
}

interface BoxState {
  readonly value: string;
}

function clampDigits(raw: string, max: number): string {
  return raw
    .replace(/\D/g, '')
    .slice(0, max);
}

export function OtpInput({
  onCodeChange,
  value,
  disabled = false,
  autoFocus = true,
  accessibilityLabel = 'Verification code',
  onComplete,
}: OtpInputProps): JSX.Element {
  const theme = useTheme();
  const inputsRef = useRef<(RNTextInput | null)[]>([]);
  const [boxes, setBoxes] = useState<readonly BoxState[]>(
    Array.from({ length: OTP_LENGTH }, () => ({ value: '' })),
  );

  // Sync external `value` (e.g. parent clears the input).
  useEffect(() => {
    if (value === undefined) return;
    const digits = clampDigits(value, OTP_LENGTH);
    setBoxes(
      Array.from({ length: OTP_LENGTH }, (_, i) => ({
        value: digits[i] ?? '',
      })),
    );
  }, [value]);

  // Auto-focus the first box on mount.
  useEffect(() => {
    if (autoFocus && !disabled) {
      // Defer to next tick so refs are populated.
      const id = setTimeout(() => {
        inputsRef.current[0]?.focus();
      }, 0);
      return () => clearTimeout(id);
    }
    return;
  }, [autoFocus, disabled]);

  const emitChange = useCallback(
    (nextBoxes: readonly BoxState[]): void => {
      const code = nextBoxes.map((b) => b.value).join('');
      onCodeChange(code);
      if (code.length === OTP_LENGTH && onComplete) {
        onComplete(code);
      }
    },
    [onCodeChange, onComplete],
  );

  const handleChangeText = (index: number, raw: string): void => {
    // Strip non-digits. If user pasted multi-char text, distribute.
    const digits = clampDigits(raw, OTP_LENGTH - index);
    if (digits.length === 0) {
      // User typed a non-digit — ignore.
      return;
    }

    setBoxes((prev) => {
      const next = prev.slice();
      for (let i = 0; i < digits.length; i += 1) {
        const targetIndex = index + i;
        if (targetIndex >= OTP_LENGTH) break;
        next[targetIndex] = { value: digits[i] ?? '' };
      }
      emitChange(next);
      return next;
    });

    // Advance focus to the box after the last filled digit, or the
    // last box if we ran out of room.
    const nextFocusIndex = Math.min(index + digits.length, OTP_LENGTH - 1);
    inputsRef.current[nextFocusIndex]?.focus();
  };

  const handleKeyPress = (index: number, key: string): void => {
    if (key !== 'Backspace') return;
    setBoxes((prev) => {
      const next = prev.slice();
      const current = prev[index];
      if (current && current.value !== '') {
        // Clear the current box in place.
        next[index] = { value: '' };
        emitChange(next);
        return next;
      }
      // Current box is empty — move focus back and clear the previous.
      if (index > 0) {
        next[index - 1] = { value: '' };
        emitChange(next);
        // Defer focus so React renders the cleared state first.
        setTimeout(() => inputsRef.current[index - 1]?.focus(), 0);
      }
      return next;
    });
  };

  const boxBorderColor = (filled: boolean): string =>
    filled ? theme.colors.brandPrimary : theme.colors.border;

  return (
    <View
      style={styles.container}
      accessibilityRole="none"
      accessibilityLabel={accessibilityLabel}
    >
      {boxes.map((box, index) => {
        const label = `Verification code digit ${index + 1}`;
        return (
          <RNTextInput
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            ref={(el) => {
              inputsRef.current[index] = el;
            }}
            value={box.value}
            onChangeText={(raw) => handleChangeText(index, raw)}
            onKeyPress={(e) => handleKeyPress(index, e.nativeEvent.key)}
            editable={!disabled}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            maxLength={OTP_LENGTH - index}
            accessibilityLabel={label}
            accessibilityRole="text"
            style={[
              theme.typography.amountMedium,
              styles.box,
              {
                color: theme.colors.textPrimary,
                borderColor: boxBorderColor(box.value !== ''),
                backgroundColor: theme.colors.surface,
                opacity: disabled ? theme.opacity.disabled : theme.opacity.active,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  box: {
    width: 48,
    height: touchTargets.comfortable,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    textAlign: 'center',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
});
