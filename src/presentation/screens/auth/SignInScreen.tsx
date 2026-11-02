/**
 * SignInScreen — entry point for email-OTP sign-in (Prompt 23).
 *
 * Flow:
 *   - User enters an email.
 *   - The "Send Code" button is disabled while the email is invalid.
 *   - On press, the screen calls {@link RequestEmailOtpUseCase}.
 *   - On success → navigate to /auth/verify?email=<email>&sentAt=<epochMs>.
 *   - On rate-limit → show a countdown and disable the button.
 *   - On network error → show a retry prompt.
 *
 * SECURITY:
 *   - The screen NEVER reveals whether an account already exists for
 *     the email. Success and "no such account" both render the same
 *     "code sent" UI.
 *   - The email is trimmed and lowercased before submission.
 *   - The email is not logged.
 */

import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TextInput } from 'react-native';

import { RequestEmailOtpUseCase } from '@application/identity/email-otp/request-email-otp.usecase';
import type { RequestEmailOtpResult } from '@application/identity/email-otp/request-email-otp.usecase';
import type { AuthenticationProvider } from '@domain/ports/authentication-provider.port';
import { isEmailAddress } from '@domain/value-objects/email-address';
import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';

export interface SignInScreenProps {
  /**
   * The use case to invoke. The presentation layer is responsible for
   * wiring this to a real {@link AuthenticationProvider} at the
   * composition root.
   */
  readonly requestEmailOtp: RequestEmailOtpUseCase;
  /** Optional override for navigation (defaults to expo-router). */
  readonly onNavigateToVerify?: (email: string, sentAtMs: number) => void;
  /** Optional override for "I already have an account" / back button. */
  readonly onBack?: () => void;
}

interface FormState {
  readonly email: string;
  readonly loading: boolean;
  readonly result: RequestEmailOtpResult | null;
  readonly rateLimitUntilMs: number;
}

const INITIAL_FORM: FormState = {
  email: '',
  loading: false,
  result: null,
  rateLimitUntilMs: 0,
};

export function SignInScreen({
  requestEmailOtp,
  onNavigateToVerify,
  onBack,
}: SignInScreenProps): JSX.Element {
  const theme = useTheme();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [nowTick, setNowTick] = useState(Date.now());

  // Tick every 250ms while a rate-limit countdown is active so the UI
  // updates smoothly. Stop ticking once the countdown ends.
  useEffect(() => {
    if (form.rateLimitUntilMs <= nowTick) return;
    const id = setInterval(() => setNowTick(Date.now()), 250);
    return () => clearInterval(id);
  }, [form.rateLimitUntilMs, nowTick]);

  const trimmedEmail = form.email.trim().toLowerCase();
  const isValidEmail = isEmailAddress(trimmedEmail);

  const remainingCooldownMs = Math.max(0, form.rateLimitUntilMs - nowTick);
  const isRateLimited = remainingCooldownMs > 0;

  const canSend = useMemo(
    () => isValidEmail && !form.loading && !isRateLimited,
    [isValidEmail, form.loading, isRateLimited],
  );

  const handleSendCode = useCallback(async (): Promise<void> => {
    if (!canSend) return;
    setForm((prev) => ({ ...prev, loading: true, result: null }));
    const result = await requestEmailOtp.execute(trimmedEmail);
    if (result.success) {
      const sentAt = Date.now();
      if (onNavigateToVerify) {
        onNavigateToVerify(trimmedEmail, sentAt);
      } else {
        router.push({
          pathname: '/auth/verify',
          params: { email: trimmedEmail, sentAt: String(sentAt) },
        });
      }
      setForm((prev) => ({ ...prev, loading: false, result }));
      return;
    }
    const rateLimitUntilMs = result.retryAfterMs
      ? Date.now() + result.retryAfterMs
      : 0;
    setForm((prev) => ({
      ...prev,
      loading: false,
      result,
      rateLimitUntilMs,
    }));
  }, [canSend, requestEmailOtp, trimmedEmail, onNavigateToVerify]);

  const errorMessage = (() => {
    if (!form.result || form.result.success) return null;
    if (form.result.errorCode === 'rate_limited') {
      const seconds = Math.ceil(remainingCooldownMs / 1000);
      return `Too many attempts. Please wait ${seconds}s before requesting a new code.`;
    }
    if (form.result.errorCode === 'invalid_email') {
      return 'Please enter a valid email address.';
    }
    if (form.result.errorCode === 'network_unavailable') {
      return 'Network unavailable. Please check your connection and try again.';
    }
    return form.result.errorMessage ?? 'Unable to send code. Please try again.';
  })();

  const handleBack = useCallback((): void => {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/onboarding/welcome');
  }, [onBack]);

  const countdownLabel = isRateLimited
    ? `Resend available in ${Math.ceil(remainingCooldownMs / 1000)}s`
    : null;

  return (
    <Screen scrollable safeArea>
      <Stack gap="xl" align="stretch" style={{ padding: spacing.xl }}>
        <Stack gap="sm" align="stretch">
          <Text variant="screenTitle" color="primary" accessibilityRole="header">
            Sign in
          </Text>
          <Text variant="body" color="secondary">
            We&apos;ll send a one-time code to your email. Use it to sign in or
            create an account.
          </Text>
        </Stack>

        <Card elevation="sm" padding="lg">
          <Stack gap="md" align="stretch">
            <Text variant="label" color="secondary">
              Email address
            </Text>
            <TextInput
              value={form.email}
              onChangeText={(next) => setForm((prev) => ({ ...prev, email: next }))}
              placeholder="you@example.com"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="username"
              accessibilityLabel="Email address"
              accessibilityHint="Enter the email address to receive a verification code"
              accessibilityValue={{ text: trimmedEmail }}
              editable={!form.loading}
              style={[
                theme.typography.input,
                {
                  color: theme.colors.textPrimary,
                  borderWidth: 1,
                  borderColor:
                    form.email.length === 0 || isValidEmail
                      ? theme.colors.border
                      : theme.colors.negative,
                  borderRadius: theme.borderRadius.md,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.md,
                  minHeight: 48,
                },
              ]}
            />
            {errorMessage ? (
              <Text variant="error" color="negative" accessibilityRole="alert">
                {errorMessage}
              </Text>
            ) : null}
            {countdownLabel ? (
              <Text variant="caption" color="muted">
                {countdownLabel}
              </Text>
            ) : null}
          </Stack>
        </Card>

        <Stack gap="md" align="stretch">
          <Button
            label={form.loading ? 'Sending…' : 'Send Code'}
            variant="primary"
            size="lg"
            onPress={handleSendCode}
            disabled={!canSend}
            loading={form.loading}
            accessibilityLabel="Send verification code"
            accessibilityState={{ disabled: !canSend, busy: form.loading }}
          />
          <Button
            label="Back"
            variant="ghost"
            size="md"
            onPress={handleBack}
            disabled={form.loading}
            accessibilityLabel="Go back"
          />
        </Stack>

        <Text variant="caption" color="muted">
          By continuing you agree to BillLens&apos;s Terms and Privacy Policy.
          Your email is used only for sign-in.
        </Text>
      </Stack>
    </Screen>
  );
}

/**
 * Convenience factory for tests / composition roots that already hold
 * an {@link AuthenticationProvider}. Avoids re-typing the use-case
 * constructor signature at every call site.
 */
export function makeSignInScreenProps(
  authProvider: AuthenticationProvider,
): SignInScreenProps {
  return {
    requestEmailOtp: new RequestEmailOtpUseCase(authProvider),
  };
}
