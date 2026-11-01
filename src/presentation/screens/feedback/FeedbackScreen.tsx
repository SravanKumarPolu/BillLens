/**
 * FeedbackScreen — the user-facing feedback submission surface (Prompt 82's
 * presentation layer; closes the documented "feedback UI surface pending
 * integration" gap from the Phase 9 progress table).
 *
 * Submit path: Settings → "Send feedback" → this screen →
 * `SubmitFeedbackUseCase` → `SqliteFeedbackRepository` (local, redacted).
 *
 * PRIVACY CONTRACT (mirrored from the domain layer):
 *   - The body is redacted by the use case BEFORE persistence — emails,
 *     phone numbers, UPI IDs, file paths, exact amounts, and raw OCR text
 *     are automatically removed. The screen tells the user this up front
 *     so nobody pastes credentials expecting them to travel.
 *   - Feedback is stored ON THIS DEVICE only. The cloud feedback backend
 *     (support ticket creation, cross-user aggregation) is deferred until
 *     the Supabase project is provisioned — the screen says exactly that
 *     instead of implying a support conversation exists.
 *   - `contactOptIn` is opt-in and stores NO contact details — only the
 *     boolean "the user agreed to be contacted" (the identity system owns
 *     any contact address separately).
 *
 * NPS and the App Store review prompt are deliberately NOT reachable from
 * this screen — they are eligibility-gated flows (90-day NPS cooldown,
 * 180-day review-prompt cooldown) driven by their own use cases.
 */

import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, TextInput, View } from 'react-native';

import type { SubmitFeedbackOutput } from '@application/feedback';
import { APP_METADATA } from '@config/app-metadata';
import type { FeedbackType } from '@domain/feedback';
import { FEEDBACK_BODY_MAX_LENGTH } from '@domain/feedback';
import {
  Button,
  Card,
  Icon,
  Row,
  Stack,
  Text,
  useTheme,
  spacing,
} from '@presentation/design-system';
import { tryGetAppServices, useAppServicesReady } from '@store/services-registry';

// ---------------------------------------------------------------------------
// User-facing feedback types (NPS / app_store_review / ocr_correction are
// driven by their own eligibility-gated flows, not this manual form).
// ---------------------------------------------------------------------------

interface FeedbackTypeOption {
  readonly type: Extract<FeedbackType, 'general' | 'feature_request' | 'bug_report'>;
  readonly label: string;
  readonly caption: string;
  readonly icon: string;
}

const FEEDBACK_TYPE_OPTIONS: readonly FeedbackTypeOption[] = [
  {
    type: 'general',
    label: 'General',
    caption: 'Anything else you want to tell us',
    icon: 'chatbubbles-outline',
  },
  {
    type: 'feature_request',
    label: 'Feature request',
    caption: 'Something you wish BillLens could do',
    icon: 'lightbulb-outline',
  },
  {
    type: 'bug_report',
    label: 'Bug report',
    caption: 'Something broke or behaved oddly',
    icon: 'bug-outline',
  },
] as const;

const MIN_BODY_LENGTH = 1;

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export function FeedbackScreen(): JSX.Element {
  const servicesReady = useAppServicesReady();
  const [type, setType] = useState<FeedbackTypeOption['type']>('general');
  const [body, setBody] = useState('');
  const [contactOptIn, setContactOptIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<SubmitFeedbackOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (): Promise<void> => {
    const services = tryGetAppServices();
    if (services === null) return;
    if (body.trim().length < MIN_BODY_LENGTH) return;

    setSubmitting(true);
    setError(null);
    try {
      const result = await services.feedback.submitFeedback.execute({
        id: generateFeedbackId(),
        type,
        body,
        appVersion: APP_METADATA.version,
        platform: feedbackPlatform(),
        submittedAt: new Date().toISOString(),
        contactOptIn,
      });
      setSubmitted(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Feedback could not be saved.');
    } finally {
      setSubmitting(false);
    }
  }, [body, contactOptIn, type]);

  const reset = useCallback((): void => {
    setType('general');
    setBody('');
    setContactOptIn(false);
    setSubmitted(null);
    setError(null);
  }, []);

  return (
    <FeedbackView
      type={type}
      onTypeChange={setType}
      body={body}
      onBodyChange={setBody}
      contactOptIn={contactOptIn}
      onContactOptInChange={setContactOptIn}
      submitting={submitting}
      submitted={submitted}
      error={error}
      onSubmit={() => {
        void submit();
      }}
      onReset={reset}
      servicesReady={servicesReady}
    />
  );
}

// ---------------------------------------------------------------------------
// View — pure presentational component
// ---------------------------------------------------------------------------

export interface FeedbackViewProps {
  readonly type: FeedbackTypeOption['type'];
  readonly onTypeChange: (type: FeedbackTypeOption['type']) => void;
  readonly body: string;
  readonly onBodyChange: (body: string) => void;
  readonly contactOptIn: boolean;
  readonly onContactOptInChange: (optIn: boolean) => void;
  readonly submitting: boolean;
  readonly submitted: SubmitFeedbackOutput | null;
  readonly error: string | null;
  readonly onSubmit: () => void;
  readonly onReset: () => void;
  readonly servicesReady: boolean;
}

export function FeedbackView({
  type,
  onTypeChange,
  body,
  onBodyChange,
  contactOptIn,
  onContactOptInChange,
  submitting,
  submitted,
  error,
  onSubmit,
  onReset,
  servicesReady,
}: FeedbackViewProps): JSX.Element {
  const theme = useTheme();
  const trimmedBody = body.trim();
  const bodyValid = trimmedBody.length >= MIN_BODY_LENGTH;
  const canSubmit = servicesReady && bodyValid && !submitting && submitted === null;

  if (submitted !== null) {
    return (
      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
        <SubmittedCard onReset={onReset} />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack gap="xs" align="stretch">
        <Text variant="screenTitle" color="primary" accessibilityRole="header">
          Send feedback
        </Text>
        <Text variant="body" color="secondary">
          Tell us what is working, what is missing, or what broke. Your words
          help shape what BillLens builds next.
        </Text>
      </Stack>

      <PrivacyNoticeCard />

      {error !== null ? (
        <Card elevation="sm" padding="md" accessibilityRole="alert">
          <Row gap="md" align="center">
            <Icon
              name="warning-outline"
              size={theme.iconSizes.lg}
              color={theme.colors.negative}
            />
            <Stack gap={0} style={{ flex: 1 }}>
              <Text variant="bodyStrong" color="primary">
                Feedback could not be saved
              </Text>
              <Text variant="caption" color="secondary">
                {error}
              </Text>
            </Stack>
          </Row>
        </Card>
      ) : null}

      <Stack gap="md" align="stretch">
        <Text variant="sectionTitle" color="primary" accessibilityRole="header">
          What kind of feedback?
        </Text>
        {FEEDBACK_TYPE_OPTIONS.map((option) => (
          <TypeOptionRow
            key={option.type}
            option={option}
            selected={type === option.type}
            onPress={() => onTypeChange(option.type)}
          />
        ))}
      </Stack>

      <Stack gap="xs" align="stretch">
        <Text variant="sectionTitle" color="primary" accessibilityRole="header">
          Your feedback
        </Text>
        <TextInput
          value={body}
          onChangeText={onBodyChange}
          placeholder="Write freely — personal details are removed automatically before anything is stored."
          placeholderTextColor={theme.colors.textMuted}
          maxLength={FEEDBACK_BODY_MAX_LENGTH}
          multiline
          autoCapitalize="sentences"
          autoCorrect
          accessibilityLabel="Feedback text"
          accessibilityHint={`Free text, up to ${FEEDBACK_BODY_MAX_LENGTH} characters. Personal details are redacted automatically.`}
          testID="feedback-input"
          style={[
            theme.typography.input,
            {
              color: theme.colors.textPrimary,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.borderRadius.md,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.md,
              minHeight: 140,
              textAlignVertical: 'top',
            },
          ]}
        />
        <Row gap="xs" align="center">
          <View style={{ flex: 1 }} />
          <Text variant="caption" color="muted">
            {`${body.length} / ${FEEDBACK_BODY_MAX_LENGTH}`}
          </Text>
        </Row>
      </Stack>

      <ContactOptInRow
        contactOptIn={contactOptIn}
        onContactOptInChange={onContactOptInChange}
      />

      <Button
        label={submitting ? 'Saving…' : 'Send feedback'}
        icon="send-outline"
        variant="primary"
        onPress={onSubmit}
        disabled={!canSubmit}
        loading={submitting}
        accessibilityLabel={
          servicesReady
            ? 'Send feedback — saves a privacy-redacted copy on this device'
            : 'Send feedback — waiting for the app to finish starting'
        }
      />

      {!servicesReady ? (
        <Text variant="caption" color="muted" style={{ textAlign: 'center' }}>
          Waiting for app services — feedback can be sent once the app has
          finished starting.
        </Text>
      ) : null}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

function PrivacyNoticeCard(): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="none" padding="md" accessibilityRole="text">
      <Row gap="md" align="flex-start">
        <Icon
          name="shield-checkmark-outline"
          size={theme.iconSizes.lg}
          color={theme.colors.positive}
        />
        <Stack gap="xs" style={{ flex: 1 }}>
          <Text variant="bodyStrong" color="primary">
            Private by design
          </Text>
          <Text variant="caption" color="secondary">
            Email addresses, phone numbers, UPI IDs, file paths, and exact
            amounts are removed automatically before anything is stored.
            Feedback is kept on this device only — there is no live support
            inbox yet, and nothing is invented in its place.
          </Text>
        </Stack>
      </Row>
    </Card>
  );
}

interface TypeOptionRowProps {
  readonly option: FeedbackTypeOption;
  readonly selected: boolean;
  readonly onPress: () => void;
}

function TypeOptionRow({ option, selected, onPress }: TypeOptionRowProps): ReactNode {
  const theme = useTheme();
  return (
    <Card
      elevation={selected ? 'sm' : 'none'}
      padding="md"
      style={{
        borderWidth: 1,
        borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
      }}
    >
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel={`${option.label} — ${option.caption}`}
        accessibilityState={{ selected }}
        onPress={onPress}
        style={({ pressed }) => ({
          minHeight: 44,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Row gap="md" align="center">
          <Icon
            name={option.icon}
            size={theme.iconSizes.lg}
            color={selected ? theme.colors.brandPrimary : theme.colors.textMuted}
          />
          <Stack gap={0} style={{ flex: 1 }}>
            <Text variant="bodyStrong" color={selected ? 'primary' : 'secondary'}>
              {option.label}
            </Text>
            <Text variant="caption" color="muted">
              {option.caption}
            </Text>
          </Stack>
          {selected ? (
            <Icon
              name="checkmark-circle"
              size={theme.iconSizes.lg}
              color={theme.colors.brandPrimary}
            />
          ) : null}
        </Row>
      </Pressable>
    </Card>
  );
}

interface ContactOptInRowProps {
  readonly contactOptIn: boolean;
  readonly onContactOptInChange: (optIn: boolean) => void;
}

function ContactOptInRow({
  contactOptIn,
  onContactOptInChange,
}: ContactOptInRowProps): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="none" padding="md">
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="Contact me about this feedback"
        accessibilityState={{ checked: contactOptIn }}
        onPress={() => onContactOptInChange(!contactOptIn)}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Row gap="md" align="center">
          <Icon
            name={contactOptIn ? 'checkbox' : 'square-outline'}
            size={theme.iconSizes.lg}
            color={contactOptIn ? theme.colors.brandPrimary : theme.colors.textMuted}
          />
          <Stack gap={0} style={{ flex: 1 }}>
            <Text variant="body" color="primary">
              It is okay to contact me about this feedback
            </Text>
            <Text variant="caption" color="muted">
              Stores only your yes/no choice — never an email address or phone
              number inside the feedback itself.
            </Text>
          </Stack>
        </Row>
      </Pressable>
    </Card>
  );
}

function SubmittedCard({ onReset }: { readonly onReset: () => void }): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="sm" padding="lg">
      <Stack gap="md" align="center">
        <Icon
          name="checkmark-circle-outline"
          size={theme.iconSizes.xl}
          color={theme.colors.positive}
        />
        <Stack gap="xs" align="center">
          <Text variant="cardTitle" color="primary">
            Thank you — feedback saved
          </Text>
          <Text variant="caption" color="secondary" style={{ textAlign: 'center' }}>
            A privacy-redacted copy is stored on this device. It will be
            delivered to the product team once the feedback backend is live —
            no data leaves your phone today.
          </Text>
        </Stack>
        <Button
          label="Send more feedback"
          variant="secondary"
          onPress={onReset}
          accessibilityLabel="Send more feedback — resets the form"
        />
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateFeedbackId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `fb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Narrow RN's Platform.OS to the Feedback platform union ('windows'/'macos' map to 'web'). */
function feedbackPlatform(): 'ios' | 'android' | 'web' {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}
