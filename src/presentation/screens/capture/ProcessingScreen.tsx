/**
 * ProcessingScreen — capture-processing UI running the REAL pipeline
 * (v2.4.0).
 *
 * Shows:
 *   - An indeterminate progress indicator (animated pulsing icon — NO
 *     fake percentage values) with a status message that cycles through
 *     the pipeline stages while the real `ProcessCaptureUseCase` runs.
 *   - A Cancel button (aborts the in-flight OCR call safely).
 *   - On failure: an error card with Retry / Choose another image /
 *     Add manually options.
 *   - On success: navigates to `/drafts/<draftId>` (the review screen).
 *   - On duplicate: navigates to the EXISTING draft (the image was
 *     already scanned and is still awaiting review).
 *
 * Architecture:
 *   - The container reads the route params (`imageUri`, `mode`,
 *     `groupId`), resolves the services registry, and invokes
 *     `services.capture.processCapture` ONCE per attempt with an
 *     AbortController for cancellation.
 *   - The pure presentational component `ProcessingView` reads a
 *     `ProcessingViewModel` (status, statusMessage, errorMessage) —
 *     unchanged from the Phase 2 design, so its tests remain valid.
 */

import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { CapturePipelineError } from '@application/capture';
import type { CaptureSourceType } from '@domain/entities/capture-source';
import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Icon } from '@presentation/design-system/components/Icon';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { motion, spacing } from '@presentation/design-system/tokens';
import { useReducedMotion } from '@presentation/hooks/use-reduced-motion';
import { PROCESSING_STATUS_MESSAGES, useCaptureStore } from '@store/capture-store';
import { useAppServicesReady, tryGetAppServices } from '@store/services-registry';

// ---------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------

export type ProcessingStatus = 'processing' | 'failed';

export interface ProcessingViewModel {
  readonly status: ProcessingStatus;
  readonly statusMessage: string;
  readonly errorMessage: string | null;
  /**
   * True when OCR is not configured in this build — the failure card
   * hides the Retry button (a configuration gap cannot be retried away)
   * and presents manual entry as the primary action. (v2.5.0)
   */
  readonly ocrUnavailable: boolean;
}

export interface ProcessingInput {
  readonly status: ProcessingStatus;
  readonly statusMessage?: string;
  readonly errorMessage?: string | null;
  readonly ocrUnavailable?: boolean;
}

export function createProcessingViewModel(input: ProcessingInput): ProcessingViewModel {
  return {
    status: input.status,
    statusMessage:
      input.statusMessage ??
      PROCESSING_STATUS_MESSAGES[0]!,
    errorMessage: input.status === 'failed' ? (input.errorMessage ?? 'Processing failed.') : null,
    ocrUnavailable: input.ocrUnavailable ?? false,
  };
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export interface ProcessingScreenProps {
  /** Local file:// URI of the image to process (from camera / gallery). */
  readonly imageUri?: string;
  readonly groupId?: string;
  readonly mode?: 'payment' | 'scan';
  readonly sourceType?: CaptureSourceType;
  /**
   * Override the status (used by tests to drive the failure state
   * without running the pipeline). When omitted, the real pipeline runs.
   */
  readonly statusOverride?: ProcessingStatus;
  readonly errorMessageOverride?: string;
}

/** Deterministic source type from mode + explicit override. */
function resolveSourceType(
  mode?: 'payment' | 'scan',
  sourceType?: CaptureSourceType,
): CaptureSourceType {
  if (sourceType !== undefined) return sourceType;
  return mode === 'payment' ? 'upi_screenshot' : 'paper_receipt';
}

export function ProcessingScreen({
  imageUri,
  groupId,
  mode,
  sourceType,
  statusOverride,
  errorMessageOverride,
}: ProcessingScreenProps): JSX.Element {
  const [status, setStatus] = useState<ProcessingStatus>(statusOverride ?? 'processing');
  const [statusMessage, setStatusMessage] = useState<string>(PROCESSING_STATUS_MESSAGES[0]!);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [ocrUnavailable, setOcrUnavailable] = useState(false);

  const servicesReady = useAppServicesReady();
  const setProcessingMessage = useCaptureStore((s) => s.setProcessingMessage);
  const attemptRef = useRef(0);

  // Sync overrides (for tests).
  useEffect(() => {
    if (statusOverride !== undefined) {
      setStatus(statusOverride);
      if (statusOverride === 'failed') {
        setErrorMessage(errorMessageOverride ?? 'Processing failed.');
      } else {
        setErrorMessage(null);
      }
    }
  }, [statusOverride, errorMessageOverride]);

  // --- Run the REAL pipeline (v2.4.0) -------------------------------------
  useEffect(() => {
    if (statusOverride !== undefined) return; // test override wins
    if (!servicesReady) return;
    if (status !== 'processing') return; // failed / finished — retry re-arms
    if (imageUri === undefined || imageUri.length === 0) {
      setStatus('failed');
      setErrorMessage('No image was provided. Please retake or re-select the photo.');
      return;
    }

 const services = tryGetAppServices();
    if (services === null) return;

    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;
    const controller = new AbortController();
    let finished = false;

    void (async () => {
      try {
        const output = await services.capture.processCapture.execute({
          imageUri,
          sourceType: resolveSourceType(mode, sourceType),
          ...(groupId !== undefined && groupId.length > 0 ? { groupId } : {}),
          userId: 'local-user' as never,
          signal: controller.signal,
        });
        if (finished || attempt !== attemptRef.current) return; // stale attempt
        finished = true;

        if (output.outcome === 'cancelled') {
          router.back();
          return;
        }

        if (output.outcome === 'already_processing') {
          // A run for this exact image is in flight — route to its draft.
          setStatus('failed');
          setErrorMessage(
            'This image is already being processed. Opening the existing scan…',
          );
          if (output.draftId !== undefined) {
            router.replace(`/drafts/${output.draftId as string}`);
          } else {
            router.back();
          }
          return;
        }

        if (output.outcome === 'duplicate') {
          setStatus('failed');
          setErrorMessage(
            'This image was already scanned — opening the existing draft for review.',
          );
          if (output.draftId !== undefined) {
            router.replace(`/drafts/${output.draftId as string}`);
          } else {
            router.back();
          }
          return;
        }

        // completed — open the review screen for the new draft.
        router.replace(`/drafts/${output.draftId as string}`);
      } catch (error) {
        if (finished || attempt !== attemptRef.current) return; // stale attempt
        finished = true;
        const unavailable =
          error instanceof CapturePipelineError && error.code === 'OCR_UNAVAILABLE';
        const message =
          error instanceof CapturePipelineError
            ? error.message
            : 'Receipt scanning failed. Please retry or add the expense manually.';
        setStatus('failed');
        setErrorMessage(message);
        setOcrUnavailable(unavailable);
        setProcessingMessage('Processing failed');
      }
    })();

    return () => {
      finished = true; // unmount stops stale results from navigating
      controller.abort();
    };
  }, [servicesReady, status, imageUri, mode, sourceType, groupId, statusOverride, setProcessingMessage]);

  // Cycle status messages every 1.5s while processing.
  useEffect(() => {
    if (status !== 'processing') return;
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % PROCESSING_STATUS_MESSAGES.length;
      setStatusMessage(PROCESSING_STATUS_MESSAGES[i]!);
      setProcessingMessage(PROCESSING_STATUS_MESSAGES[i]!);
    }, 1500);
    return () => clearInterval(interval);
  }, [status, setProcessingMessage]);

  const viewModel = useMemo(
    () => createProcessingViewModel({ status, statusMessage, errorMessage, ocrUnavailable }),
    [status, statusMessage, errorMessage, ocrUnavailable],
  );

  const handleCancel = (): void => {
    // The pipeline's AbortController aborts via the effect cleanup on
    // unmount; navigating back is the user-visible cancellation.
    router.back();
  };

  const handleRetry = (): void => {
    setStatus('processing');
    setStatusMessage(PROCESSING_STATUS_MESSAGES[0]!);
    setErrorMessage(null);
  };

  const handleChooseAnother = (): void => {
    const params = new URLSearchParams();
    if (mode) params.set('mode', mode);
    if (groupId) params.set('groupId', groupId);
    const query = params.toString();
    router.replace(query.length > 0 ? `/capture?${query}` : '/capture');
  };

  const handleAddManually = (): void => {
    const params = new URLSearchParams();
    if (groupId) params.set('groupId', groupId);
    const query = params.toString();
    router.replace(query.length > 0 ? `/expenses/new?${query}` : '/expenses/new');
  };

  return (
    <ProcessingView
      viewModel={viewModel}
      onCancel={handleCancel}
      onRetry={handleRetry}
      onChooseAnother={handleChooseAnother}
      onAddManually={handleAddManually}
    />
  );
}

// ---------------------------------------------------------------------------
// View — pure presentational component.
// ---------------------------------------------------------------------------

export interface ProcessingViewProps {
  readonly viewModel: ProcessingViewModel;
  readonly onCancel: () => void;
  readonly onRetry: () => void;
  readonly onChooseAnother: () => void;
  readonly onAddManually: () => void;
}

export function ProcessingView({
  viewModel,
  onCancel,
  onRetry,
  onChooseAnother,
  onAddManually,
}: ProcessingViewProps): JSX.Element {
  return (
    <Screen safeArea>
      <View style={{ flex: 1, padding: spacing.xl, justifyContent: 'space-between' }}>
        <Stack gap="lg" align="stretch" style={{ flex: 1, justifyContent: 'center' }}>
          {viewModel.status === 'processing' ? (
            <ProcessingIndicator message={viewModel.statusMessage} />
          ) : viewModel.ocrUnavailable ? (
            <UnavailableCard
              message={viewModel.errorMessage ?? 'Receipt scanning is unavailable.'}
              onChooseAnother={onChooseAnother}
              onAddManually={onAddManually}
            />
          ) : (
            <FailureCard
              message={viewModel.errorMessage ?? 'Processing failed.'}
              onRetry={onRetry}
              onChooseAnother={onChooseAnother}
              onAddManually={onAddManually}
            />
          )}
        </Stack>

        <Row gap="md" align="stretch">
          <Button
            label={viewModel.status === 'processing' ? 'Cancel' : 'Back'}
            variant="ghost"
            size="md"
            onPress={onCancel}
            accessibilityLabel={
              viewModel.status === 'processing'
                ? 'Cancel processing'
                : 'Go back from the processing screen'
            }
            style={{ flex: 1 }}
          />
        </Row>
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Indeterminate processing indicator
// ---------------------------------------------------------------------------

interface ProcessingIndicatorProps {
  readonly message: string;
}

function ProcessingIndicator({ message }: ProcessingIndicatorProps): ReactNode {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(theme.opacity.muted)).current;

  useEffect(() => {
    // Phase 6: the pulsing loop is decorative — under "reduce motion"
    // render the indicator STATIC (fully opaque, no scale cycling).
    // The progressbar semantics + text carry the same information.
    if (reduceMotion) {
      scale.setValue(1);
      opacity.setValue(theme.opacity.active);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1.1,
            duration: motion.slow,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: theme.opacity.active,
            duration: motion.slow,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 0.8,
            duration: motion.slow,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: theme.opacity.muted,
            duration: motion.slow,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, scale, opacity, theme.opacity.active, theme.opacity.muted]);

  return (
    <Stack gap="lg" align="center">
      <Animated.View
        accessibilityRole="progressbar"
        accessibilityLabel={`Processing: ${message}`}
        style={{
          width: 96,
          height: 96,
          borderRadius: theme.borderRadius.full,
          backgroundColor: theme.colors.surfaceMuted,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale }],
          opacity,
        }}
      >
        <Icon name="sparkles" size={theme.iconSizes.xl} color={theme.colors.brandPrimary} />
      </Animated.View>
      <Stack gap="xs" align="center">
        <Text variant="sectionTitle" color="primary">
          Processing…
        </Text>
        <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
          {message}
        </Text>
        <Text variant="caption" color="muted">
          This usually takes a few seconds.
        </Text>
      </Stack>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Unavailable card — OCR is not configured in this build (v2.5.0).
// Retry is intentionally absent: a configuration gap cannot be retried
// away. Manual entry is the primary recovery path.
// ---------------------------------------------------------------------------

interface UnavailableCardProps {
  readonly message: string;
  readonly onChooseAnother: () => void;
  readonly onAddManually: () => void;
}

function UnavailableCard({
  message,
  onChooseAnother,
  onAddManually,
}: UnavailableCardProps): ReactNode {
  const theme = useTheme();
  return (
    <Card
      elevation="sm"
      padding="xxl"
      accessibilityRole="text"
      accessibilityLabel={`Receipt scanning unavailable: ${message}`}
      style={{ borderColor: theme.colors.warning, borderWidth: 1 }}
    >
      <Stack gap="lg" align="center">
        <Row
          gap="sm"
          align="center"
          style={{
            width: 72,
            height: 72,
            borderRadius: theme.borderRadius.full,
            backgroundColor: theme.colors.surfaceMuted,
            justifyContent: 'center',
          }}
        >
          <Icon name="cloud-offline-outline" size={theme.iconSizes.xl} color={theme.colors.textSecondary} />
        </Row>
        <Stack gap="xs" align="center">
          <Text variant="sectionTitle" color="primary">
            Receipt scanning unavailable
          </Text>
          <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
            {message}
          </Text>
        </Stack>
        <Stack gap="sm" align="stretch" style={{ width: '100%' }}>
          <Button
            label="Add manually"
            variant="primary"
            size="md"
            onPress={onAddManually}
            accessibilityLabel="Enter the expense manually"
            icon="create-outline"
          />
          <Button
            label="Choose another image"
            variant="secondary"
            size="md"
            onPress={onChooseAnother}
            accessibilityLabel="Choose a different image to process"
            icon="images-outline"
          />
        </Stack>
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Failure card
// ---------------------------------------------------------------------------

interface FailureCardProps {
  readonly message: string;
  readonly onRetry: () => void;
  readonly onChooseAnother: () => void;
  readonly onAddManually: () => void;
}

function FailureCard({
  message,
  onRetry,
  onChooseAnother,
  onAddManually,
}: FailureCardProps): ReactNode {
  const theme = useTheme();
  return (
    <Card
      elevation="sm"
      padding="xxl"
      accessibilityRole="text"
      accessibilityLabel={`Processing failed: ${message}`}
      style={{ borderColor: theme.colors.negative, borderWidth: 1 }}
    >
      <Stack gap="lg" align="center">
        <Row
          gap="sm"
          align="center"
          style={{
            width: 72,
            height: 72,
            borderRadius: theme.borderRadius.full,
            backgroundColor: theme.colors.surfaceMuted,
            justifyContent: 'center',
          }}
        >
          <Icon name="warning-outline" size={theme.iconSizes.xl} color={theme.colors.negative} />
        </Row>
        <Stack gap="xs" align="center">
          <Text variant="sectionTitle" color="primary">
            Processing failed
          </Text>
          <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
            {message}
          </Text>
        </Stack>
        <Stack gap="sm" align="stretch" style={{ width: '100%' }}>
          <Button
            label="Retry"
            variant="primary"
            size="md"
            onPress={onRetry}
            accessibilityLabel="Retry processing the image"
            icon="refresh-outline"
          />
          <Button
            label="Choose another image"
            variant="secondary"
            size="md"
            onPress={onChooseAnother}
            accessibilityLabel="Choose a different image to process"
            icon="images-outline"
          />
          <Button
            label="Add manually"
            variant="ghost"
            size="md"
            onPress={onAddManually}
            accessibilityLabel="Skip processing and enter the expense manually"
            icon="create-outline"
          />
        </Stack>
      </Stack>
    </Card>
  );
}
