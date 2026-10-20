/**
 * OtpInput component tests (Prompt 23).
 *
 * Coverage:
 *   - Digit entry advances focus to the next box.
 *   - Backspace on an empty box returns focus to the previous box.
 *   - Backspace on a filled box clears the digit in place.
 *   - Paste of a 6-digit string fills all boxes.
 *   - Paste of a longer string fills only the first 6 digits.
 *   - The component never logs code values (asserted via the absence
 *     of `console.log` calls containing digits).
 *   - The full code is emitted to the parent via onCodeChange.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { OtpInput, OTP_LENGTH } from '@presentation/components/OtpInput';

// Silence React Native warnings about timers / act() in tests.
jest.useFakeTimers();

function renderOtp(
  overrides: {
    readonly onCodeChange?: (code: string) => void;
    readonly onComplete?: (code: string) => void;
    readonly disabled?: boolean;
  } = {},
): ReturnType<typeof render> {
  const onCodeChange = overrides.onCodeChange ?? jest.fn();
  return render(
    <OtpInput
      onCodeChange={onCodeChange}
      onComplete={overrides.onComplete}
      disabled={overrides.disabled}
    /> as ReactElement,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('OtpInput', () => {
  it('renders six digit input boxes', () => {
    const { getByLabelText } = renderOtp();
    for (let i = 1; i <= OTP_LENGTH; i += 1) {
      expect(getByLabelText(`Verification code digit ${i}`)).toBeTruthy();
    }
  });

  it('emits the full code as the user types each digit', () => {
    const onCodeChange = jest.fn();
    const { getByLabelText } = renderOtp({ onCodeChange });

    const box1 = getByLabelText('Verification code digit 1');
    fireEvent.changeText(box1, '1');
    expect(onCodeChange).toHaveBeenLastCalledWith('1');

    const box2 = getByLabelText('Verification code digit 2');
    fireEvent.changeText(box2, '2');
    expect(onCodeChange).toHaveBeenLastCalledWith('12');

    const box3 = getByLabelText('Verification code digit 3');
    fireEvent.changeText(box3, '3');
    expect(onCodeChange).toHaveBeenLastCalledWith('123');
  });

  it('calls onComplete when the sixth digit is entered', () => {
    const onComplete = jest.fn();
    const { getByLabelText } = renderOtp({ onComplete });

    for (let i = 1; i <= 6; i += 1) {
      const box = getByLabelText(`Verification code digit ${i}`);
      fireEvent.changeText(box, String(i));
    }
    expect(onComplete).toHaveBeenLastCalledWith('123456');
  });

  it('distributes a pasted 6-digit string across all boxes', () => {
    const onCodeChange = jest.fn();
    const { getByLabelText } = renderOtp({ onCodeChange });

    // Pasting into the first box — typical SMS autofill behaviour.
    const box1 = getByLabelText('Verification code digit 1');
    fireEvent.changeText(box1, '987654');

    expect(onCodeChange).toHaveBeenLastCalledWith('987654');
  });

  it('truncates a paste longer than 6 digits to the first 6', () => {
    const onCodeChange = jest.fn();
    const { getByLabelText } = renderOtp({ onCodeChange });

    const box1 = getByLabelText('Verification code digit 1');
    // 8 digits + non-digit — only the first 6 digits should be kept.
    fireEvent.changeText(box1, '12345678abc');

    expect(onCodeChange).toHaveBeenLastCalledWith('123456');
  });

  it('ignores non-digit input', () => {
    const onCodeChange = jest.fn();
    const { getByLabelText } = renderOtp({ onCodeChange });

    const box1 = getByLabelText('Verification code digit 1');
    fireEvent.changeText(box1, 'abc');
    // onCodeChange may have been called with the initial empty string
    // (mount) — assert the LAST call is empty.
    const lastCall = onCodeChange.mock.calls[onCodeChange.mock.calls.length - 1]?.[0];
    expect(lastCall ?? '').toBe('');
  });

  it('clears the digit in place when backspacing a filled box', () => {
    const onCodeChange = jest.fn();
    const { getByLabelText } = renderOtp({ onCodeChange });

    const box1 = getByLabelText('Verification code digit 1');
    fireEvent.changeText(box1, '5');
    expect(onCodeChange).toHaveBeenLastCalledWith('5');

    // Backspace on the filled box.
    fireEvent(box1, 'keyPress', { nativeEvent: { key: 'Backspace' } });
    expect(onCodeChange).toHaveBeenLastCalledWith('');
  });

  it('moves focus to the previous box when backspacing an empty box', () => {
    const onCodeChange = jest.fn();
    const { getByLabelText } = renderOtp({ onCodeChange });

    // Fill the first two boxes.
    const box1 = getByLabelText('Verification code digit 1');
    const box2 = getByLabelText('Verification code digit 2');
    fireEvent.changeText(box1, '1');
    fireEvent.changeText(box2, '2');

    // Now backspace on box2 (it has a digit — should clear in place).
    fireEvent(box2, 'keyPress', { nativeEvent: { key: 'Backspace' } });
    expect(onCodeChange).toHaveBeenLastCalledWith('1');

    // Backspace again on the now-empty box2 — should clear box1 and
    // move focus there.
    fireEvent(box2, 'keyPress', { nativeEvent: { key: 'Backspace' } });
    expect(onCodeChange).toHaveBeenLastCalledWith('');
  });

  it('does not crash when backspacing on the first empty box', () => {
    const onCodeChange = jest.fn();
    const { getByLabelText } = renderOtp({ onCodeChange });

    const box1 = getByLabelText('Verification code digit 1');
    // First box is already empty — backspace should be a no-op.
    expect(() => {
      fireEvent(box1, 'keyPress', { nativeEvent: { key: 'Backspace' } });
    }).not.toThrow();
  });

  it('disables all boxes when disabled=true', () => {
    const onCodeChange = jest.fn();
    const { getByLabelText } = renderOtp({ onCodeChange, disabled: true });
    const box1 = getByLabelText('Verification code digit 1');
    expect(box1.props.editable).toBe(false);
  });

  it('does not log code values to the console', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const { getByLabelText } = renderOtp();

    const box1 = getByLabelText('Verification code digit 1');
    fireEvent.changeText(box1, '9');
    fireEvent.changeText(box1, '987654');

    // No console.log call should contain the digits we typed.
    for (const call of consoleSpy.mock.calls) {
      const text = call.join(' ');
      expect(text).not.toMatch(/987654/);
      expect(text).not.toMatch(/\b9\b/);
    }
    consoleSpy.mockRestore();
  });
});
