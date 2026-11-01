/**
 * VerifyScreen — OTP verification (Prompt 23).
 *
 * Flow:
 *   - Receive the email being verified (prop or route param).
 *   - Render the {@link OtpInput} component for 6-digit entry.
 *   - "Verify" button disabled while the code is incomplete.
 *   - "Resend Code" link with countdown timer.
 *   - "Change email" link → back to sign-in.
 *   - On success: check if a guest identity has local data. If yes,
 *     navigate to the upgrade flow; otherwise, navigate to the main app.
 *
 * SECURITY:
 *   - The OTP code is NEVER logged or rendered outside the input boxes.
 *   - Error messages are generic — they distinguish expired / wrong /
 *     too-many-attempts but never reveal the expected code.
 */

import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AuthError } from '@application/identity/auth-errors';
import { type ResendEmailOtpUseCase } from '@application/identity/email-otp/resend-email-otp.usecase';
import {
  OTP_CODE_PATTERN,
  type VerifyEmailOtpUseCase,
} from '@application/identity/email-otp/verify-email-otp.usecase';
import type { AuthSession } from '@domain/ports/authentication-provider.port';
import { OtpInput } from '@presentation/components/OtpInput';
import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { spacing } from '@presentation/design-system/tokens';

export interface VerifyScreenProps {
  readonly email: string;
  /** Epoch ms of the initial OTP request (used for resend cooldown). */
  readonly initialSentAtMs: number;
  readonly verifyUseCase: VerifyEmailOtpUseCase;
  readonly resendUseCase: ResendEmailOtpUseCase;
  /**
   * Called after a successful verification. The presentation layer's
   * composition root decides whether to navigate to the upgrade flow
   * or the main app (based on whether local guest data exists).
   */
  readonly onVerified?: (session: AuthSession) => void;
  /** Navigate back to sign-in. */
  readonly onChangeEmail?: () => void;
}

const CODE_LENGTH = 6;

interface FormState {
  readonly code: string;
  readonly loading: boolean;
  readonly errorCode: AuthError['code'] | null;
  readonly errorMessage: string | null;
  readonly lastSentAtMs: number;
  readonly resendCooldownUntilMs: number;
}

export function VerifyScreen({
  email,
  initialSentAtMs,
  verifyUseCase,
  resendUseCase,
  onVerified,
  onChangeEmail,
}: VerifyScreenProps): JSX.Element {
  const [form, setForm] = useState<FormState>({
    code: '',
    loading: false,
    errorCode: null,
    errorMessage: null,
    lastSentAtMs: initialSentAtMs,
    resendCooldownUntilMs: initialSentAtMs + 60_000,
  });
  const [nowTick, setNowTick] = useState(Date.now());

  // Countdown ticker — only runs while a cooldown is active.
  useEffect(() => {
    if (form.resendCooldownUntilMs <= nowTick) return;
    const id = setInterval(() => setNowTick(Date.now()), 250);
    return () => clearInterval(id);
  }, [form.resendCooldownUntilMs, nowTick]);

  const remainingCooldownMs = Math.max(0, form.resendCooldownUntilMs - nowTick);
  const canResend = remainingCooldownMs === 0 && !form.loading;

  const isCodeComplete = OTP_CODE_PATTERN.test(form.code);
  const canVerify = isCodeComplete && !form.loading;

  const handleCodeChange = useCallback((next: string): void => {
    setForm((prev) => ({
      ...prev,
      code: next,
      // Clear any previous error as soon as the user edits the code.
      errorCode: null,
      errorMessage: null,
    }));
  }, []);

  const handleVerify = useCallback(async (): Promise<void> => {
    if (!canVerify) return;
    setForm((prev) => ({ ...prev, loading: true, errorCode: null, errorMessage: null }));
    try {
      const result = await verifyUseCase.execute({ email, code: form.code });
      setForm((prev) => ({ ...prev, loading: false }));
      if (onVerified) {
        onVerified(result.session);
        return;
      }
      // Default navigation: the composition root will replace this
      // with a route-guard-aware redirect (upgrade flow vs main app).
      router.replace('/(tabs)');
    } catch (error) {
      const authError =
        error instanceof AuthError
          ? error
          : new AuthError('unknown_auth_failure', 'Verification failed');
      setForm((prev) => ({
        ...prev,
        loading: false,
        errorCode: authError.code,
        errorMessage: authError.message,
      }));
    }
  }, [canVerify, verifyUseCase, email, form.code, onVerified]);

  const handleResend = useCallback(async (): Promise<void> => {
    if (!canResend) return;
    setForm((prev) => ({ ...prev, loading: true, errorCode: null, errorMessage: null }));
    const result = await resendUseCase.execute({
      email,
      lastSentAtMs: form.lastSentAtMs,
    });
    if (result.success) {
      setForm((prev) => ({
        ...prev,
        loading: false,
        lastSentAtMs: Date.now(),
        resendCooldownUntilMs: result.nextAllowedAtMs,
      }));
      return;
    }
    setForm((prev) => ({
      ...prev,
      loading: false,
      resendCooldownUntilMs: result.nextAllowedAtMs,
      errorCode: result.errorCode ?? null,
      errorMessage: result.errorMessage ?? null,
    }));
  }, [canResend, resendUseCase, email, form.lastSentAtMs]);

  const handleChangeEmail = useCallback((): void => {
    if (onChangeEmail) {
      onChangeEmail();
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/auth/sign-in');
  }, [onChangeEmail]);

  const errorMessage = useMemo(() => {
    if (!form.errorCode) return null;
    switch (form.errorCode) {
      case 'expired_otp':
        return 'That code has expired. Please request a new one.';
      case 'invalid_otp':
        return 'That code is incorrect. Please try again.';
      case 'rate_limited':
        return 'Too many attempts. Please wait before trying again.';
      case 'network_unavailable':
        return 'Network unavailable. Please check your connection.';
      default:
        return form.errorMessage ?? 'Verification failed. Please try again.';
    }
  }, [form.errorCode, form.errorMessage]);

  return (
    <Screen scrollable safeArea>
      <Stack gap="xl" align="stretch" style={{ padding: spacing.xl }}>
        <Stack gap="sm" align="stretch">
          <Text variant="screenTitle" color="primary" accessibilityRole="header">
            Enter your code
          </Text>
          <Text variant="body" color="secondary">
            We sent a 6-digit code to <Text variant="bodyStrong">{email}</Text>.
            Enter it below to continue.
          </Text>
        </Stack>

        <Card elevation="sm" padding="lg">
          <Stack gap="md" align="stretch">
            <OtpInput
              onCodeChange={handleCodeChange}
              disabled={form.loading}
              accessibilityLabel="Six-digit verification code"
            />
            {errorMessage ? (
              <Text variant="error" color="negative" accessibilityRole="alert">
                {errorMessage}
              </Text>
            ) : null}
            <Stack gap={0} align="stretch">
              <Button
                label={form.loading ? 'Verifying…' : 'Verify'}
                variant="primary"
                size="lg"
                onPress={handleVerify}
                disabled={!canVerify}
                loading={form.loading}
                accessibilityLabel="Verify code"
                accessibilityState={{ disabled: !canVerify, busy: form.loading }}
              />
            </Stack>
          </Stack>
        </Card>

        <Stack gap="sm" align="center">
          {canResend ? (
            <Button
              label="Resend code"
              variant="ghost"
              size="md"
              onPress={handleResend}
              disabled={form.loading}
              accessibilityLabel="Resend verification code"
            />
          ) : (
            <Text variant="caption" color="muted">
              Resend code in {Math.ceil(remainingCooldownMs / 1000)}s
            </Text>
          )}
          <Button
            label="Change email"
            variant="ghost"
            size="sm"
            onPress={handleChangeEmail}
            disabled={form.loading}
            accessibilityLabel="Change email address"
          />
        </Stack>
      </Stack>
    </Screen>
  );
}

/** Expected code length (re-exported for tests / parent components). */
export const VERIFY_CODE_LENGTH = CODE_LENGTH;
