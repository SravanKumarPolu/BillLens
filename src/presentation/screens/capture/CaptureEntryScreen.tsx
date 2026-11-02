/**
 * CaptureEntryScreen — the entry-point for the capture flow (Prompt 17).
 *
 * Presents four large cards:
 *   1. Scan Receipt          → /capture/camera
 *   2. Import from Gallery   → /capture/gallery
 *   3. Import Payment Screenshot → /capture/camera?mode=payment
 *   4. Add Manually          → /expenses/new
 *
 * A privacy notice at the bottom shows the current storage preference
 * (read from the capture store) so the user always knows how the next
 * image will be handled.
 *
 * Architecture:
 *   - The thin container `CaptureEntryScreen` reads `useCaptureStore`
 *     only for the privacy-notice default. All four options are static
 *     data; the navigation targets are pure strings.
 *   - The pure presentational component `CaptureEntryView` reads the
 *     `groupId` (optional) and `defaultStorageMode` and renders the
 *     cards.
 */

import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Pressable } from 'react-native';

import { PrivacyNotice } from '@presentation/components/PrivacyNotice';
import { Card } from '@presentation/design-system/components/Card';
import { Icon } from '@presentation/design-system/components/Icon';
import { IconButton } from '@presentation/design-system/components/IconButton';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import type { StorageMode } from '@presentation/view-models/groups';
import { useCaptureStore } from '@store/capture-store';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface CaptureOption {
  readonly id: 'scan' | 'gallery' | 'payment' | 'manual';
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  readonly hrefBuilder: (groupId?: string) => string;
}

const CAPTURE_OPTIONS: readonly CaptureOption[] = [
  {
    id: 'scan',
    label: 'Scan Receipt',
    description: 'For paper restaurant, grocery or travel receipts',
    icon: 'scan-outline',
    hrefBuilder: (groupId) =>
      groupId
        ? `/capture/camera?groupId=${encodeURIComponent(groupId)}`
        : '/capture/camera',
  },
  {
    id: 'gallery',
    label: 'Import from Gallery',
    description: 'Select an existing receipt image',
    icon: 'images-outline',
    hrefBuilder: (groupId) =>
      groupId
        ? `/capture/gallery?groupId=${encodeURIComponent(groupId)}`
        : '/capture/gallery',
  },
  {
    id: 'payment',
    label: 'Import Payment Screenshot',
    description: 'For UPI, bank, card or wallet payments',
    icon: 'phone-portrait-outline',
    hrefBuilder: (groupId) =>
      groupId
        ? `/capture/camera?mode=payment&groupId=${encodeURIComponent(groupId)}`
        : '/capture/camera?mode=payment',
  },
  {
    id: 'manual',
    label: 'Add Manually',
    description: 'For cash payments or when no image is available',
    icon: 'create-outline',
    hrefBuilder: (groupId) =>
      groupId
        ? `/expenses/new?groupId=${encodeURIComponent(groupId)}`
        : '/expenses/new',
  },
];

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export interface CaptureEntryScreenProps {
  /** Optional source hint from the route query (?source=gallery|payment). */
  readonly source?: 'gallery' | 'payment' | 'scan';
  /** Optional group id from the route query (?groupId=…). */
  readonly groupId?: string;
}

export function CaptureEntryScreen({ source, groupId }: CaptureEntryScreenProps): JSX.Element {
  const defaultStorageMode = useCaptureStore((s) => s.defaultStorageMode);

  // When `source` is supplied via deep link, auto-advance to the
  // matching option. The navigation happens once on mount via a
  // layout effect so the user lands directly on the camera/gallery
  // flow when they came in via a deep link.
  useAutoAdvance(source, groupId);

  return (
    <CaptureEntryView
      groupId={groupId}
      defaultStorageMode={defaultStorageMode}
      onClose={() => router.back()}
    />
  );
}

/**
 * Auto-advance to the matching option when the screen is opened with
 * a `source` query param. Navigates via `router.replace` so the
 * capture entry is removed from the back stack (pressing Back from
 * the camera/gallery returns to whatever launched the deep link,
 * not back into the capture entry).
 *
 * Phase 5: the real camera and gallery surfaces now exist, so this
 * hook actually navigates instead of being a no-op.
 */
function useAutoAdvance(
  source: 'gallery' | 'payment' | 'scan' | undefined,
  groupId: string | undefined,
): void {
  const hasAdvanced = useRef(false);
  useEffect(() => {
    if (hasAdvanced.current) return;
    if (source === undefined) return;
    hasAdvanced.current = true;
    const option = CAPTURE_OPTIONS.find((o) => o.id === source) ?? null;
    if (option === null) return;
    const href = option.hrefBuilder(groupId);
    // `replace` keeps the back stack clean — back from the camera goes
    // to whatever launched the deep link, not back to the capture entry.
    if (router.canGoBack()) {
      router.replace(href);
    } else {
      router.push(href);
    }
  }, [source, groupId]);
}

// ---------------------------------------------------------------------------
// View — pure presentational component.
// ---------------------------------------------------------------------------

export interface CaptureEntryViewProps {
  readonly groupId?: string;
  readonly defaultStorageMode: StorageMode;
  readonly onClose: () => void;
}

export function CaptureEntryView({
  groupId,
  defaultStorageMode,
  onClose,
}: CaptureEntryViewProps): JSX.Element {
  const handleSelect = (option: CaptureOption): void => {
    router.push(option.hrefBuilder(groupId));
  };

  return (
    <Screen scrollable safeArea>
      <Stack gap="lg" align="stretch" style={{ padding: spacing.xl }}>
        <Row gap="md" align="center">
          <Stack gap={0} style={{ flex: 1 }}>
            <Text variant="screenTitle" color="primary" accessibilityRole="header">
              Add Expense
            </Text>
            <Text variant="body" color="secondary">
              Choose how you want to capture this expense.
            </Text>
          </Stack>
          <IconButton
            icon="close-outline"
            onPress={onClose}
            accessibilityLabel="Close the capture screen"
          />
        </Row>

        <Stack gap="md" align="stretch">
          {CAPTURE_OPTIONS.map((option) => (
            <CaptureOptionCard
              key={option.id}
              option={option}
              onSelect={handleSelect}
            />
          ))}
        </Stack>

        <PrivacyNotice
          mode={defaultStorageMode}
          accessibilityLabel="Receipt privacy preference for new captures"
        />
      </Stack>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Capture-option card
// ---------------------------------------------------------------------------

interface CaptureOptionCardProps {
  readonly option: CaptureOption;
  readonly onSelect: (option: CaptureOption) => void;
}

function CaptureOptionCard({ option, onSelect }: CaptureOptionCardProps): ReactNode {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => onSelect(option)}
      accessibilityRole="button"
      accessibilityLabel={option.label}
      accessibilityHint={option.description}
    >
      {({ pressed }) => (
        <Card
          elevation={pressed ? 'none' : 'sm'}
          padding="lg"
          style={{
            backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface,
          }}
        >
          <Row gap="md" align="center">
            <Row
              gap="sm"
              align="center"
              style={{
                width: 48,
                height: 48,
                borderRadius: theme.borderRadius.full,
                backgroundColor: theme.colors.surfaceMuted,
                justifyContent: 'center',
              }}
            >
              <Icon name={option.icon} size={theme.iconSizes.lg} color={theme.colors.brandPrimary} />
            </Row>
            <Stack gap={0} style={{ flex: 1 }}>
              <Text variant="bodyStrong" color="primary">
                {option.label}
              </Text>
              <Text variant="caption" color="secondary">
                {option.description}
              </Text>
            </Stack>
            <Icon name="chevron-forward" size={theme.iconSizes.md} color={theme.colors.textMuted} />
          </Row>
        </Card>
      )}
    </Pressable>
  );
}

// Re-export the option list for tests / previews.
export { CAPTURE_OPTIONS };
