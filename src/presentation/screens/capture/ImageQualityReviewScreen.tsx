/**
 * ImageQualityReviewScreen — full-screen image preview with quality
 * warnings (Prompt 17).
 *
 * Shows the captured image, surfaces any quality issues detected by
 * the capture pipeline (blurry, cropped, low-light, unsupported), and
 * lets the user retake or continue anyway.
 *
 * Phase 2: there is no real computer-vision pipeline yet, so the
 * screen renders a static note ("Image quality check is not yet
 * available") instead of fake quality results. The buttons still work
 * — "Retake" navigates back to the camera, "Continue Anyway" forwards
 * to the processing screen.
 *
 * Architecture:
 *   - The thin container reads the route params (`imageUri`, `groupId`).
 *   - The pure presentational component reads a `viewModel` (imageUri,
 *     warnings, isPhase2Stub) and emits `onRetake` / `onContinue`.
 */

import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';

import { evaluateImageQuality } from '@application/capture';
import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Icon } from '@presentation/design-system/components/Icon';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';

// ---------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------

export type ImageQualityWarningKind =
  | 'blurry'
  | 'cropped'
  | 'low_light'
  | 'unsupported';

export interface ImageQualityWarning {
  readonly kind: ImageQualityWarningKind;
  readonly message: string;
}

export interface ImageQualityReviewViewModel {
  /** Local file:// URI of the captured image (or undefined in Phase 2 stub). */
  readonly imageUri: string | undefined;
  /** Detected quality warnings (empty in Phase 2 — no CV pipeline yet). */
  readonly warnings: readonly ImageQualityWarning[];
  /** True when the image-quality CV pipeline is not yet wired up. */
  readonly isPhase2Stub: boolean;
}

export interface ImageQualityReviewInput {
  readonly imageUri?: string;
  readonly warnings?: readonly ImageQualityWarning[];
  readonly isPhase2Stub?: boolean;
}

export function createImageQualityReviewViewModel(
  input: ImageQualityReviewInput,
): ImageQualityReviewViewModel {
  return {
    imageUri: input.imageUri,
    warnings: input.warnings ?? [],
    isPhase2Stub: input.isPhase2Stub ?? true,
  };
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export interface ImageQualityReviewScreenProps {
  readonly imageUri?: string;
  readonly groupId?: string;
  readonly mode?: 'payment' | 'scan';
  readonly sourceType?: string;
  /** Injectable file facts reader (tests). Reads size/mime via expo-file-system. */
  readonly readImageFacts?: (
    uri: string,
  ) => Promise<{ sizeBytes: number; mimeType?: string }>;
}

/** Production file-facts reader (expo-file-system `File.info()`). */
async function defaultReadImageFacts(
  uri: string,
): Promise<{ sizeBytes: number; mimeType?: string }> {
  const { File } = await import('expo-file-system');
  const file = new File(uri);
  const info = file.info();
  if (!info.exists) {
    throw new Error(`Image file not found: ${uri}`);
  }
  return { sizeBytes: info.size ?? 0 };
}

export function ImageQualityReviewScreen({
  imageUri,
  groupId,
  mode,
  sourceType,
  readImageFacts = defaultReadImageFacts,
}: ImageQualityReviewScreenProps): JSX.Element {
  // Real technical quality gate (v2.4.0): file size + format checks the
  // device CAN verify cheaply. Blur / crop / low-light detection is not
  // possible without CV — the OCR stage covers it through confidence
  // scores, surfaced on the draft review screen. The notice below says
  // exactly that (no fake CV results).
  const [warnings, setWarnings] = useState<readonly ImageQualityWarning[]>([]);
  const [blocked, setBlocked] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (imageUri === undefined) {
      setWarnings([]);
      setBlocked(true);
      setChecked(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const facts = await readImageFacts(imageUri);
        if (cancelled) return;
        const evaluation = evaluateImageQuality(facts);
        setWarnings(evaluation.warnings);
        setBlocked(evaluation.blocked);
      } catch {
        if (cancelled) return;
        setWarnings([
          {
            kind: 'unsupported',
            message:
              'The image could not be read from storage. Please retake or re-select the photo.',
          },
        ]);
        setBlocked(true);
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imageUri, readImageFacts]);

  const viewModel = createImageQualityReviewViewModel({
    imageUri,
    warnings,
    isPhase2Stub: false,
  });

  const handleRetake = (): void => {
    router.back();
  };

  const handleContinue = (): void => {
    const params = new URLSearchParams();
    if (imageUri) params.set('imageUri', imageUri);
    if (mode) params.set('mode', mode);
    if (groupId) params.set('groupId', groupId);
    if (sourceType) params.set('sourceType', sourceType);
    const query = params.toString();
    router.push(query.length > 0 ? `/capture/processing?${query}` : '/capture/processing');
  };

  return (
    <ImageQualityReviewView
      viewModel={viewModel}
      checked={checked}
      blocked={blocked}
      onRetake={handleRetake}
      onContinue={handleContinue}
    />
  );
}

// ---------------------------------------------------------------------------
// View — pure presentational component.
// ---------------------------------------------------------------------------

export interface ImageQualityReviewViewProps {
  readonly viewModel: ImageQualityReviewViewModel;
  /** True once the technical checks finished (drives the notice copy). */
  readonly checked: boolean;
  /** True when the image must not be sent to OCR (blocked warnings). */
  readonly blocked: boolean;
  readonly onRetake: () => void;
  readonly onContinue: () => void;
}

const WARNING_ICONS: Readonly<Record<ImageQualityWarningKind, string>> = {
  blurry: 'blur-outline',
  cropped: 'crop-outline',
  low_light: 'moon-outline',
  unsupported: 'alert-circle-outline',
};

export function ImageQualityReviewView({
  viewModel,
  checked,
  blocked,
  onRetake,
  onContinue,
}: ImageQualityReviewViewProps): JSX.Element {
  const theme = useTheme();

  return (
    <Screen safeArea={false}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        {/* Full-screen image preview */}
        <View style={{ flex: 1 }}>
          {viewModel.imageUri ? (
            <Image
              source={{ uri: viewModel.imageUri }}
              style={{ flex: 1, resizeMode: 'contain' }}
              accessibilityLabel="Captured receipt preview"
              accessibilityRole="image"
            />
          ) : (
            <ImagePlaceholder />
          )}
        </View>

        {/* Warnings + actions sheet */}
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: theme.borderRadius.xl,
            borderTopRightRadius: theme.borderRadius.xl,
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.lg,
            paddingBottom: spacing.xxl,
            borderTopWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Stack gap="md" align="stretch">
            {/* Honest scope notice: device-side checks are technical
                (size/format); blur/low-light quality is assessed by the
                OCR stage through confidence scores. */}
            {viewModel.isPhase2Stub ? null : (
              <Card
                elevation="none"
                padding="md"
                accessibilityRole="text"
                accessibilityLabel={
                  checked
                    ? 'Basic technical checks passed. Detailed quality is assessed during scanning.'
                    : 'Checking image…'
                }
                style={{
                  backgroundColor: theme.colors.surfaceMuted,
                  borderColor: theme.colors.border,
                }}
              >
                <Row gap="sm" align="flex-start">
                  <Icon
                    name="information-circle-outline"
                    size={theme.iconSizes.md}
                    color={theme.colors.info}
                  />
                  <Stack gap={0} style={{ flex: 1 }}>
                    <Text variant="bodyStrong" color="primary">
                      {checked ? 'Basic checks done' : 'Checking image…'}
                    </Text>
                    <Text variant="caption" color="secondary">
                      Size and format are verified on-device. Blur, crop, and low light are
                      assessed during scanning — low-confidence fields always come back for
                      your review before anything is saved.
                    </Text>
                  </Stack>
                </Row>
              </Card>
            )}

            {viewModel.warnings.length > 0 ? (
              <Stack gap="sm" align="stretch">
                {viewModel.warnings.map((warning) => (
                  <WarningRow key={warning.kind} warning={warning} />
                ))}
              </Stack>
            ) : null}

            <Row gap="md" align="stretch">
              <Button
                label="Retake"
                variant="secondary"
                size="md"
                onPress={onRetake}
                accessibilityLabel="Retake the photo"
                icon="camera-outline"
                style={{ flex: 1 }}
              />
              <Button
                label={blocked ? 'Cannot continue' : 'Continue'}
                variant="primary"
                size="md"
                disabled={blocked}
                onPress={onContinue}
                accessibilityLabel={
                  blocked
                    ? 'Continue is unavailable because the image failed the basic checks'
                    : 'Continue to processing with this image'
                }
                icon="arrow-forward-outline"
                style={{ flex: 1 }}
              />
            </Row>
          </Stack>
        </View>
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Image placeholder (Phase 2: no real capture yet)
// ---------------------------------------------------------------------------

function ImagePlaceholder(): ReactNode {
  const theme = useTheme();
  return (
    <View
      accessibilityLabel="Captured image placeholder"
      accessibilityRole="image"
      style={{
        flex: 1,
        backgroundColor: theme.colors.surfaceMuted,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Stack gap="sm" align="center">
        <Icon name="image-outline" size={theme.iconSizes.xl} color={theme.colors.textMuted} />
        <Text variant="caption" color="muted">
          Captured image preview will appear here.
        </Text>
      </Stack>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Warning row
// ---------------------------------------------------------------------------

interface WarningRowProps {
  readonly warning: ImageQualityWarning;
}

function WarningRow({ warning }: WarningRowProps): ReactNode {
  const theme = useTheme();
  const icon = WARNING_ICONS[warning.kind] ?? 'alert-circle-outline';
  return (
    <Card
      elevation="none"
      padding="md"
      accessibilityRole="text"
      style={{
        borderColor: theme.colors.warning,
        borderWidth: 1,
        backgroundColor: theme.colors.surface,
      }}
    >
      <Row gap="sm" align="flex-start">
        <Icon name={icon} size={theme.iconSizes.md} color={theme.colors.warning} />
        <Stack gap={0} style={{ flex: 1 }}>
          <Text variant="bodyStrong" color="primary">
            {warning.message}
          </Text>
        </Stack>
      </Row>
    </Card>
  );
}
