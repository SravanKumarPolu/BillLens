/**
 * GalleryPickerScreen — launches the OS image picker to choose an
 * existing receipt or payment screenshot from the user's photo library.
 *
 * Phase 5 capture pipeline entry point. The previous `/capture/gallery`
 * route was a placeholder that delegated to `CaptureEntryScreen`. This
 * implementation is the real picker surface using `expo-image-picker`'s
 * `launchImageLibraryAsync` API.
 *
 * Flow:
 *   1. On mount: request media library permission via
 *      `requestMediaLibraryPermissionsAsync()`.
 *   2. Once granted: call `launchImageLibraryAsync` to surface the
 *      system picker (no UI of our own — the OS handles it).
 *   3. On success → navigate to
 *      `/capture/image-quality?imageUri=<uri>&mode=<mode>&groupId=<groupId>`
 *      for the user to review the image before processing.
 *   4. On cancel → navigate back to the capture entry (or back in the
 *      stack, whichever is appropriate).
 *
 * Architecture:
 *   - The thin container `GalleryPickerScreen` owns the permission +
 *     pick side-effects. The pure presentational component
 *     `GalleryPickerView` reads ONLY from the view model + callbacks.
 *   - `expo-image-picker` is permitted in the presentation layer (not
 *     in the storage/crypto/infra import ban list).
 *   - The screen does NOT persist anything — the image URI is passed
 *     via router params to the next screen.
 */

import {
  type ImagePickerAsset,
  type ImagePickerResult,
  launchImageLibraryAsync,
  requestMediaLibraryPermissionsAsync,
} from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';

import { ensureLocalImage } from '@utils/local-image';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

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
// Types
// ---------------------------------------------------------------------------

export type GalleryPickerStatus = 'requesting' | 'denied' | 'picking' | 'succeeded' | 'cancelled' | 'failed';

export interface GalleryPickerViewModel {
  readonly status: GalleryPickerStatus;
  readonly error: string | null;
  readonly mode: 'payment' | 'scan';
  readonly groupId: string | undefined;
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export interface GalleryPickerScreenProps {
  readonly mode?: 'payment' | 'scan';
  readonly groupId?: string;
}

export function GalleryPickerScreen({ mode = 'scan', groupId }: GalleryPickerScreenProps = {}): JSX.Element {
  const params = useLocalSearchParams<{ mode?: 'payment' | 'scan'; groupId?: string }>();
  const resolvedMode = mode ?? params.mode ?? 'scan';
  const resolvedGroupId = groupId ?? params.groupId;

  const [status, setStatus] = useState<GalleryPickerStatus>('requesting');
  const [error, setError] = useState<string | null>(null);

  // Step 1: request media library permission. The picker API silently
  // returns `canceled: true` when permission is missing — surface the
  // reason explicitly so the user understands why nothing happened.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const permission = await requestMediaLibraryPermissionsAsync(false);
        if (cancelled) return;
        if (permission.status !== 'granted') {
          setStatus('denied');
          return;
        }
        setStatus('picking');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not request library permission.');
        setStatus('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Step 2: once permission is granted, launch the system picker. The
  // picker is a one-shot OS surface — it returns the asset on success or
  // `canceled: true` on cancel. Wrap it in its own effect so it does
  // not run again after the user dismisses the picker.
  useEffect(() => {
    if (status !== 'picking') return;
    let cancelled = false;
    void (async () => {
      try {
        const result: ImagePickerResult = await launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 0.8,
          allowsMultipleSelection: false,
        });
        if (cancelled) return;

        if (result.canceled) {
          setStatus('cancelled');
          return;
        }
        const asset: ImagePickerAsset | undefined = result.assets?.[0];
        if (asset === undefined || asset.uri.length === 0) {
          setError('No image was picked. Please try again.');
          setStatus('failed');
          return;
        }
        // Success — navigate to the image-quality review screen. We
        // use `router.replace` so the picker screen is removed from
        // the stack (pressing Back from the quality screen returns to
        // the capture entry, not back into the picker).
        // Android may return a content:// URI; copy it into app storage so
        // FileSystem/OCR can read it after the picker's grant is gone.
        const localUri = await ensureLocalImage(asset.uri, 'gallery');
        const query = buildImageQualityQuery(localUri, resolvedMode, resolvedGroupId);
        router.replace(`/capture/image-quality${query}`);
        setStatus('succeeded');
      } catch (err) {
        if (cancelled) return;
        console.warn('[GalleryPicker] pick failed:', err);
        setError(err instanceof Error ? err.message : 'Could not pick an image.');
        setStatus('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, resolvedMode, resolvedGroupId]);

  const handleCancel = useCallback((): void => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/capture');
    }
  }, []);

  const handleTryAgain = useCallback((): void => {
    setError(null);
    setStatus('requesting');
  }, []);

  const viewModel: GalleryPickerViewModel = {
    status,
    error,
    mode: resolvedMode,
    groupId: resolvedGroupId,
  };

  return <GalleryPickerView viewModel={viewModel} onCancel={handleCancel} onTryAgain={handleTryAgain} />;
}

/** The capture surface this screen represents (see buildImageQualityQuery). */
const SOURCE_TYPE = 'gallery';

/** Build the `?imageUri=…&mode=…&groupId=…&sourceType=…` query for the image-quality screen. */
export function buildImageQualityQuery(
  imageUri: string,
  mode: 'payment' | 'scan',
  groupId: string | undefined,
): string {
  const params = new URLSearchParams();
  params.set('imageUri', imageUri);
  params.set('mode', mode);
  // v2.26.0: propagate the capture source so the image-quality screen's
  // "Choose another image" routes back to the SAME capture surface
  // (previously it always opened the gallery, even for camera captures).
  params.set('sourceType', SOURCE_TYPE);
  if (groupId !== undefined && groupId.length > 0) {
    params.set('groupId', groupId);
  }
  const query = params.toString();
  return query.length > 0 ? `?${query}` : '';
}

// ---------------------------------------------------------------------------
// View — pure presentational component.
// ---------------------------------------------------------------------------

export interface GalleryPickerViewProps {
  readonly viewModel: GalleryPickerViewModel;
  readonly onCancel: () => void;
  readonly onTryAgain: () => void;
}

export function GalleryPickerView({
  viewModel,
  onCancel,
  onTryAgain,
}: GalleryPickerViewProps): JSX.Element {
  const theme = useTheme();

  // Picking / succeeded: indeterminate loader while the OS picker is up.
  // The OS picker is a full-screen surface; this view is hidden behind it.
  if (viewModel.status === 'picking' || viewModel.status === 'succeeded') {
    return (
      <Screen scrollable safeArea>
        <Stack gap="xl" align="stretch" style={{ padding: spacing.xl }}>
          <Card elevation="sm" padding="xxl" accessibilityRole="text">
            <Stack gap="lg" align="center">
              <ActivityIndicator size="large" color={theme.colors.brandPrimary} />
              <Stack gap="xs" align="center">
                <Text variant="sectionTitle" color="primary">
                  Opening your photo library…
                </Text>
                <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
                  Pick a receipt or payment screenshot. You will be able to review the image before
                  processing.
                </Text>
              </Stack>
            </Stack>
          </Card>
        </Stack>
      </Screen>
    );
  }

  // Cancelled: nothing picked — go back to the capture entry.
  if (viewModel.status === 'cancelled') {
    return (
      <Screen scrollable safeArea>
        <Stack gap="xl" align="stretch" style={{ padding: spacing.xl }}>
          <Card elevation="sm" padding="xxl" accessibilityRole="text">
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
                <Icon name="close-outline" size={theme.iconSizes.xl} color={theme.colors.textMuted} />
              </Row>
              <Stack gap="xs" align="center">
                <Text variant="sectionTitle" color="primary">
                  Nothing picked
                </Text>
                <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
                  You cancelled the picker. Choose another way to capture this expense.
                </Text>
              </Stack>
              <Stack gap="sm" align="stretch" style={{ width: '100%' }}>
                <Button
                  label="Back to capture"
                  variant="primary"
                  size="md"
                  onPress={onCancel}
                  accessibilityLabel="Return to the capture entry"
                  icon="arrow-back-outline"
                />
              </Stack>
            </Stack>
          </Card>
        </Stack>
      </Screen>
    );
  }

  // Denied: explain and offer a retry.
  if (viewModel.status === 'denied') {
    return (
      <Screen scrollable safeArea>
        <Stack gap="xl" align="stretch" style={{ padding: spacing.xl }}>
          <PermissionDeniedCard error={viewModel.error} onCancel={onCancel} onTryAgain={onTryAgain} />
        </Stack>
      </Screen>
    );
  }

  // Failed (requesting or picking error).
  return (
    <Screen scrollable safeArea>
      <Stack gap="xl" align="stretch" style={{ padding: spacing.xl }}>
        <FailedCard error={viewModel.error} onCancel={onCancel} onTryAgain={onTryAgain} />
      </Stack>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Card sub-components
// ---------------------------------------------------------------------------

function PermissionDeniedCard({
  error,
  onCancel,
  onTryAgain,
}: {
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onTryAgain: () => void;
}): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="sm" padding="xxl" accessibilityRole="text">
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
          <Icon name="lock-closed-outline" size={theme.iconSizes.xl} color={theme.colors.warning} />
        </Row>
        <Stack gap="xs" align="center">
          <Text variant="sectionTitle" color="primary">
            Photo library access required
          </Text>
          <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
            BillLens needs permission to read your photo library so you can import existing receipt
            images. Please grant the permission in your device settings.
          </Text>
        </Stack>
        {error !== null ? (
          <Text variant="caption" color="critical" style={{ textAlign: 'center' }}>
            {error}
          </Text>
        ) : null}
        <Stack gap="sm" align="stretch" style={{ width: '100%' }}>
          {/* v2.26.0: "Try again" re-requests in-app when possible; a
              second, explicit action opens the device settings — the
              copy already pointed users there. */}
          <Button
            label="Try again"
            variant="primary"
            size="md"
            onPress={onTryAgain}
            accessibilityLabel="Request gallery permission again"
            icon="refresh-outline"
          />
          <Button
            label="Open settings"
            variant="secondary"
            size="md"
            onPress={(): void => {
              void Linking.openSettings();
            }}
            accessibilityLabel="Open the device settings to grant photo library permission"
            icon="settings-outline"
          />
          <Button
            label="Cancel"
            variant="ghost"
            size="md"
            onPress={onCancel}
            accessibilityLabel="Return to the capture entry"
          />
        </Stack>
      </Stack>
    </Card>
  );
}

function FailedCard({
  error,
  onCancel,
  onTryAgain,
}: {
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onTryAgain: () => void;
}): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="sm" padding="xxl" accessibilityRole="alert">
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
            Could not pick an image
          </Text>
          <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
            Something went wrong while opening the photo picker. Please try again.
          </Text>
        </Stack>
        {error !== null ? (
          <Text variant="caption" color="critical" style={{ textAlign: 'center' }}>
            {error}
          </Text>
        ) : null}
        <Stack gap="sm" align="stretch" style={{ width: '100%' }}>
          <Button
            label="Try again"
            variant="primary"
            size="md"
            onPress={onTryAgain}
            accessibilityLabel="Retry the gallery picker"
            icon="refresh-outline"
          />
          <Button
            label="Cancel"
            variant="ghost"
            size="md"
            onPress={onCancel}
            accessibilityLabel="Return to the capture entry"
          />
        </Stack>
      </Stack>
    </Card>
  );
}

// Re-export for callers / tests.
export type { ImagePickerAsset, ImagePickerResult } from 'expo-image-picker';
