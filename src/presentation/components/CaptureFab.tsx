/**
 * CaptureFab — floating action button that opens a bottom sheet of
 * capture options.
 *
 * Options:
 *   - Scan receipt            → /capture
 *   - Import from gallery     → /capture (gallery picker)
 *   - Import payment screenshot → /capture (payment source)
 *   - Add expense manually    → /expenses/new
 *
 * All options funnel through the capture route except the last, which
 * skips capture entirely and goes straight to the manual expense form.
 *
 * The FAB is designed to be overlaid on the tab bar (see
 * `app/(tabs)/_layout.tsx`). It is absolutely positioned at the bottom
 * centre of its container.
 *
 * Accessibility: the FAB itself is a large touch target labelled
 * "Capture a receipt or expense". The bottom sheet renders each option
 * as a `Button` with a descriptive `accessibilityLabel`.
 */

import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable } from 'react-native';

import { Button } from '../design-system/components/Button';
import { Card } from '../design-system/components/Card';
import { Icon } from '../design-system/components/Icon';
import { Row } from '../design-system/components/Row';
import { Stack } from '../design-system/components/Stack';
import { Text } from '../design-system/components/Text';
import { useTheme } from '../design-system/theme';
import { spacing, touchTargets } from '../design-system/tokens';

type CaptureOption = {
  readonly id: 'scan' | 'gallery' | 'payment' | 'manual';
  readonly label: string;
  readonly icon: string;
  readonly description: string;
  readonly href: string;
};

const CAPTURE_OPTIONS: readonly CaptureOption[] = [
  {
    id: 'scan',
    label: 'Scan receipt',
    icon: 'camera',
    description: 'Use the camera to capture a paper receipt',
    href: '/capture',
  },
  {
    id: 'gallery',
    label: 'Import from gallery',
    icon: 'images',
    description: 'Pick an existing receipt photo from your gallery',
    href: '/capture?source=gallery',
  },
  {
    id: 'payment',
    label: 'Import payment screenshot',
    icon: 'phone-portrait',
    description: 'Capture a UPI / payment app screenshot',
    href: '/capture?source=payment',
  },
  {
    id: 'manual',
    label: 'Add expense manually',
    icon: 'create',
    description: 'Skip capture — enter the expense by hand',
    href: '/expenses/new',
  },
];

export function CaptureFab(): JSX.Element {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  const handleSelect = (option: CaptureOption): void => {
    setOpen(false);
    router.push(option.href);
  };

  return (
    <>
      {/* Floating + button */}
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Capture a receipt or expense"
        style={{
          position: 'absolute',
          bottom: spacing.xl,
          alignSelf: 'center',
          width: 56,
          height: 56,
          borderRadius: theme.borderRadius.full,
          backgroundColor: theme.colors.brandPrimary,
          alignItems: 'center',
          justifyContent: 'center',
          elevation: 8,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <Icon name="add" size={28} color={theme.colors.textOnColor} />
      </Pressable>

      {/* Bottom sheet */}
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
        accessibilityLabel="Capture options bottom sheet"
      >
        <Pressable
          onPress={() => setOpen(false)}
          accessibilityLabel="Close capture options"
          accessibilityRole="button"
          style={{
            flex: 1,
            backgroundColor: theme.colors.scrim,
            justifyContent: 'flex-end',
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            accessibilityRole="none"
            style={{
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: theme.borderRadius.xl,
              borderTopRightRadius: theme.borderRadius.xl,
              padding: spacing.xl,
              paddingBottom: spacing.xxxl,
            }}
          >
            <Stack gap="md" align="stretch">
              <Row gap="sm" align="center">
                <Text variant="sectionTitle" color="primary">
                  Add to BillLens
                </Text>
              </Row>
              <Text variant="body" color="secondary">
                Choose how you&apos;d like to capture this expense.
              </Text>
              <Card elevation="none" padding="md">
                <Stack gap="sm" align="stretch">
                  {CAPTURE_OPTIONS.map((option) => (
                    <CaptureOptionRow
                      key={option.id}
                      option={option}
                      onSelect={handleSelect}
                    />
                  ))}
                </Stack>
              </Card>
              <Stack gap={0} align="stretch" style={{ minHeight: touchTargets.minimum }}>
                <Button
                  label="Cancel"
                  variant="ghost"
                  onPress={() => setOpen(false)}
                  accessibilityLabel="Cancel and close the capture options"
                />
              </Stack>
            </Stack>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

interface CaptureOptionRowProps {
  readonly option: CaptureOption;
  readonly onSelect: (option: CaptureOption) => void;
}

function CaptureOptionRow({ option, onSelect }: CaptureOptionRowProps): JSX.Element {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => onSelect(option)}
      accessibilityRole="button"
      accessibilityLabel={option.label}
      accessibilityHint={option.description}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.sm,
        borderRadius: theme.borderRadius.md,
        backgroundColor: pressed ? theme.colors.surfaceMuted : 'transparent',
        minHeight: touchTargets.comfortable,
      })}
    >
      <Icon name={option.icon} size={theme.iconSizes.lg} color={theme.colors.brandPrimary} />
      <Stack gap={0} style={{ flex: 1 }}>
        <Text variant="bodyStrong" color="primary">
          {option.label}
        </Text>
        <Text variant="caption" color="muted">
          {option.description}
        </Text>
      </Stack>
      <Icon name="chevron-forward" size={theme.iconSizes.md} color={theme.colors.textMuted} />
    </Pressable>
  );
}
