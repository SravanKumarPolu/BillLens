/**
 * CameraScreen — live camera viewfinder for capturing a receipt or
 * payment screenshot.
 *
 * Phase 5 capture pipeline entry point. The previous `/capture/camera`
 * route was a placeholder that delegated to `CaptureEntryScreen`. This
 * implementation is the real viewfinder surface using `expo-camera`'s
 * `CameraView` component.
 *
 * Flow:
 *   1. Request camera permission via `requestCameraPermissionsAsync()`.
 *      - Denied: render a permission-requested/permission-denied card
 *        with a "Try again" CTA and a "Cancel" button.
 *      - Granted: render a full-bleed `CameraView`.
 *   2. The user composes the receipt in the viewfinder and taps the
 *      shutter button. `takePicture` resolves with a
 *      `CameraCapturedPicture` whose `uri` is a `file://` URI.
 *   3. Navigate to `/capture/image-quality?imageUri=<uri>&mode=<mode>&groupId=<groupId>`
 *      for the user to review the image before processing.
 *
 * Architecture:
 *   - The thin container `CameraScreen` owns the permission state +
 *     capture side-effects. The pure presentational component
 *     `CameraScreenView` reads ONLY from the view model + callbacks.
 *   - `expo-camera` is permitted in the presentation layer (it is not
 *     in the storage/crypto/infra import ban list — see the ESLint
 *     config in `.eslintrc.cjs`).
 *   - The screen does NOT persist anything — the image URI is passed
 *     via router params to the next screen, which delegates to the
 *     capture processor for OCR + draft creation.
 */

import {
  CameraView,
  useCameraPermissions,
  type CameraCapturedPicture,
  type CameraViewRef,
} from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';

import { ensureLocalImage } from '@utils/local-image';

import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Icon } from '@presentation/design-system/components/Icon';
import { IconButton } from '@presentation/design-system/components/IconButton';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { motion, spacing } from '@presentation/design-system/tokens';
import { useReducedMotion } from '@presentation/hooks/use-reduced-motion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CameraPermissionStatus = 'undetermined' | 'granted' | 'denied';

/**
 * Capture a frame from the native camera ref.
 *
 * Expo Camera's runtime ref exposes `takePictureAsync`; newer type
 * definitions also describe `takePicture`. Calling `takePicture` directly
 * threw "undefined is not a function" on device, so probe both and fail
 * with a clear message if neither exists.
 */
export async function takeCameraPicture(
  ref: unknown,
  options: { readonly quality: number },
): Promise<CameraCapturedPicture> {
  const camera = ref as {
    takePictureAsync?: (options: { quality: number }) => Promise<CameraCapturedPicture>;
    takePicture?: (options: { quality: number }) => Promise<CameraCapturedPicture>;
  };
  const takePicture = camera.takePictureAsync ?? camera.takePicture;
  if (typeof takePicture !== 'function') {
    throw new Error('This camera build does not expose a picture API.');
  }
  return takePicture.call(camera, options);
}

export interface CameraViewModel {
  readonly permission: CameraPermissionStatus;
  readonly capturing: boolean;
  readonly mode: 'payment' | 'scan';
  readonly groupId: string | undefined;
  readonly error: string | null;
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export interface CameraScreenProps {
  readonly mode?: 'payment' | 'scan';
  readonly groupId?: string;
}

export function CameraScreen({ mode = 'scan', groupId }: CameraScreenProps = {}): JSX.Element {
  const params = useLocalSearchParams<{ mode?: 'payment' | 'scan'; groupId?: string }>();
  const resolvedMode = mode ?? params.mode ?? 'scan';
  const resolvedGroupId = groupId ?? params.groupId;

  const [permissionResponse, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<CameraViewRef | null>(null);

  useEffect(() => {
    // The hook returns `null` until the first request resolves —
    // trigger that request once on mount so the user does not have to.
    if (permissionResponse === null) {
      void requestPermission();
    }
  }, [permissionResponse, requestPermission]);

  const permission: CameraPermissionStatus =
    permissionResponse === null
      ? 'undetermined'
      : permissionResponse.status === 'granted'
        ? 'granted'
        : 'denied';

  const handleCapture = useCallback(async (): Promise<void> => {
    if (capturing) return;
    const ref = cameraRef.current;
    if (ref === null) {
      setError('Camera is not ready yet. Wait a moment and try again.');
      return;
    }
    setCapturing(true);
    setError(null);
    try {
      const picture = await takeCameraPicture(ref, { quality: 0.8 });
      if (!picture.uri || picture.uri.length === 0) {
        throw new Error('No image was captured. Please try again.');
      }
      // Camera URIs are app-local, but normalise anyway so stale/odd paths
      // fail here with a clear message rather than later in OCR.
      const localUri = await ensureLocalImage(picture.uri, 'capture');
      const query = buildImageQualityQuery(localUri, resolvedMode, resolvedGroupId);
      router.replace(`/capture/image-quality${query}`);
    } catch (err) {
      console.warn('[CameraScreen] capture failed:', err);
      setError(err instanceof Error ? err.message : 'Could not capture the photo.');
    } finally {
      setCapturing(false);
    }
  }, [capturing, resolvedMode, resolvedGroupId]);

  const handleCancel = useCallback((): void => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/capture');
    }
  }, []);

  const viewModel: CameraViewModel = {
    permission,
    capturing,
    mode: resolvedMode,
    groupId: resolvedGroupId,
    error,
  };

  return (
    <CameraScreenView
      viewModel={viewModel}
      cameraRef={cameraRef}
      onCapture={handleCapture}
      onCancel={handleCancel}
    />
  );
}

/** Build the `?imageUri=…&mode=…&groupId=…` query for the image-quality screen. */
export function buildImageQualityQuery(
  imageUri: string,
  mode: 'payment' | 'scan',
  groupId: string | undefined,
): string {
  const params = new URLSearchParams();
  params.set('imageUri', imageUri);
  params.set('mode', mode);
  if (groupId !== undefined && groupId.length > 0) {
    params.set('groupId', groupId);
  }
  const query = params.toString();
  return query.length > 0 ? `?${query}` : '';
}

// ---------------------------------------------------------------------------
// View — pure presentational component.
// ---------------------------------------------------------------------------

export interface CameraScreenViewProps {
  readonly viewModel: CameraViewModel;
  readonly cameraRef: React.RefObject<CameraViewRef | null>;
  readonly onCapture: () => void | Promise<void>;
  readonly onCancel: () => void;
}

export function CameraScreenView({
  viewModel,
  cameraRef,
  onCapture,
  onCancel,
}: CameraScreenViewProps): JSX.Element {
  const theme = useTheme();

  // Undetermined: blank screen while the permission request is in flight.
  if (viewModel.permission === 'undetermined') {
    return (
      <Screen safeArea={false}>
        <View style={{ flex: 1, backgroundColor: theme.colors.background }} />
      </Screen>
    );
  }

  // Denied: explain the situation and offer a route back to the capture entry.
  if (viewModel.permission === 'denied') {
    return (
      <Screen scrollable safeArea>
        <Stack gap="xl" align="stretch" style={{ padding: spacing.xl }}>
          <PermissionDeniedCard error={viewModel.error} onCancel={onCancel} />
        </Stack>
      </Screen>
    );
  }

  // Granted: full-bleed viewfinder + capture sheet.
  return (
    <Screen safeArea={false}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        {/* Viewfinder */}
        <View style={{ flex: 1 }}>
          <CameraView
            ref={cameraRef as never}
            style={{ flex: 1 }}
            facing="back"
            ratio="16:9"
            onCameraReady={() => undefined}
            onMountError={(e) => console.warn('Camera mount error:', e.message)}
            accessibilityLabel="Receipt camera viewfinder"
          />
          {/* Top bar: close + mode pill */}
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              padding: spacing.lg,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <IconButton
              icon="close-outline"
              onPress={onCancel}
              accessibilityLabel="Close the camera"
            />
            <View
              style={{
                backgroundColor: theme.colors.overlay,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
                borderRadius: theme.borderRadius.full,
              }}
            >
              <Text variant="caption" color="onColor">
                {viewModel.mode === 'payment' ? 'Payment screenshot' : 'Receipt scan'}
              </Text>
            </View>
            <View style={{ width: 40 }} />
          </View>
        </View>

        {/* Bottom capture sheet */}
        <CaptureSheet
          capturing={viewModel.capturing}
          error={viewModel.error}
          onCapture={onCapture}
          onCancel={onCancel}
        />
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Capture sheet (bottom)
// ---------------------------------------------------------------------------

interface CaptureSheetProps {
  readonly capturing: boolean;
  readonly error: string | null;
  readonly onCapture: () => void | Promise<void>;
  readonly onCancel: () => void;
}

function CaptureSheet({ capturing, error, onCapture, onCancel }: CaptureSheetProps): ReactNode {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderTopLeftRadius: theme.borderRadius.xl,
        borderTopRightRadius: theme.borderRadius.xl,
        paddingHorizontal: spacing.xl,
        paddingTop: spacing.lg,
        paddingBottom: spacing.xxxl,
        borderTopWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <Stack gap="md" align="stretch">
        {error !== null ? (
          <Card
            elevation="none"
            padding="sm"
            accessibilityRole="alert"
            style={{ borderColor: theme.colors.negative, borderWidth: 1 }}
          >
            <Row gap="sm" align="center">
              <Icon name="warning-outline" size={theme.iconSizes.md} color={theme.colors.negative} />
              <Text variant="caption" color="critical" style={{ flex: 1 }}>
                {error}
              </Text>
            </Row>
          </Card>
        ) : null}

        <ShutterButton onPress={onCapture} capturing={capturing} />

        <Button
          label="Cancel"
          variant="ghost"
          size="md"
          onPress={onCancel}
          accessibilityLabel="Cancel and leave the camera"
        />
      </Stack>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shutter button (animated pulse on tap)
// ---------------------------------------------------------------------------

interface ShutterButtonProps {
  readonly onPress: () => void | Promise<void>;
  readonly capturing: boolean;
}

function ShutterButton({ onPress, capturing }: ShutterButtonProps): ReactNode {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback((): void => {
    // Phase 6: press-scale is decorative — skip it entirely when the
    // user has "reduce motion" enabled (state changes still visible
    // via border/colour/opacity, which are not motion).
    if (reduceMotion) return;
    Animated.timing(scale, {
      toValue: 0.85,
      duration: motion.fast,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [reduceMotion, scale]);

  const handlePressOut = useCallback((): void => {
    if (reduceMotion) return;
    Animated.timing(scale, {
      toValue: 1,
      duration: motion.fast,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [reduceMotion, scale]);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={capturing}
      accessibilityRole="button"
      accessibilityLabel={capturing ? 'Capturing photo, please wait' : 'Capture receipt photo'}
      accessibilityState={{ disabled: capturing, busy: capturing }}
      style={{ alignSelf: 'center' }}
    >
      <Animated.View
        style={{
          width: 72,
          height: 72,
          borderRadius: theme.borderRadius.full,
          borderWidth: 4,
          borderColor: capturing ? theme.colors.textMuted : theme.colors.brandPrimary,
          backgroundColor: capturing ? theme.colors.surfaceMuted : theme.colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale }],
          opacity: capturing ? theme.opacity.muted : theme.opacity.active,
        }}
      >
        <Icon
          name={capturing ? 'hourglass-outline' : 'camera-outline'}
          size={theme.iconSizes.xl}
          color={capturing ? theme.colors.textMuted : theme.colors.brandPrimary}
        />
      </Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Permission denied card
// ---------------------------------------------------------------------------

function PermissionDeniedCard({
  error,
  onCancel,
}: {
  readonly error: string | null;
  readonly onCancel: () => void;
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
            Camera access required
          </Text>
          <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
            BillLens needs your camera to scan receipts and capture payment screenshots. Please
            grant camera permission in your device settings and try again.
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
            onPress={onCancel}
            accessibilityLabel="Try camera permission again"
            icon="refresh-outline"
          />
        </Stack>
      </Stack>
    </Card>
  );
}
