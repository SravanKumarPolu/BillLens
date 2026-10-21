/**
 * SettingsScreen — the settings tab.
 *
 * Phase 8 (Prompt 77): the "Account" section exposes the required
 * in-app account-deletion entry point (Apple 5.1.1(v) / Play Account
 * Deletion policy).
 *
 * Phase 9 (Prompt 81): a "Diagnostics" section links to the on-device
 * operational-metrics dashboard (`/settings/metrics`).
 *
 * Phase 9 (Prompt 82): a "Feedback" entry links to the user-facing
 * feedback form (`/settings/feedback`).
 *
 * Source-level completion pass: the previously-placeholder preference
 * groups (theme, currency, notifications, privacy, about) are now
 * REAL, persisted sections:
 *   - Appearance: light / dark / system theme (via `useThemeStore`).
 *   - Receipts: default receipt-privacy storage mode (via
 *     `useCaptureStore`). The four storage-mode options render with
 *     their plain-language labels + icons.
 *   - Diagnostics: app health dashboard + pending sync count.
 *   - Feedback: send-feedback entry.
 *   - Account: delete-account entry.
 *   - About: app name + version + a short privacy promise.
 *
 * Architecture:
 *   - The thin container `SettingsScreen` reads from `useThemeStore`,
 *     `useCaptureStore`, and `useAppState`, and builds a pure
 *     presentational view model.
 *   - The pure presentational component `SettingsView` reads ONLY from
 *     the view model + callbacks.
 */

import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Pressable } from 'react-native';

import { APP_METADATA } from '@config/app-metadata';
import { Card } from '@presentation/design-system/components/Card';
import { Icon } from '@presentation/design-system/components/Icon';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import type { ThemeMode } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import {
  PRIVACY_DEFAULT_DESCRIPTIONS,
  PRIVACY_DEFAULT_ICONS,
  PRIVACY_DEFAULT_LABELS,
  type StorageMode,
} from '@presentation/view-models/groups';
import { useAppState } from '@store/app-state-store';
import { useCaptureStore } from '@store/capture-store';
import { useThemeStore } from '@store/theme-store';

// ---------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------

export interface SettingsViewModel {
  readonly themeMode: ThemeMode;
  readonly defaultStorageMode: StorageMode;
  readonly pendingSyncCount: number;
  readonly hasFailedSync: boolean;
  /** v2.5.0 — conflict/permanently-failed ops awaiting user review. */
  readonly failedSyncCount: number;
  readonly appVersion: string;
  readonly appName: string;
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export function SettingsScreen(): JSX.Element {
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const defaultStorageMode = useCaptureStore((s) => s.defaultStorageMode);
  const setDefaultStorageMode = useCaptureStore((s) => s.setDefaultStorageMode);
  const pendingSyncCount = useAppState((s) => s.pendingSyncCount);
  const failedSyncCount = useAppState((s) => s.failedSyncCount);
  const hasFailedSync = useAppState((s) => s.hasFailedSync);

  const viewModel = useMemo<SettingsViewModel>(
    () => ({
      themeMode,
      defaultStorageMode,
      pendingSyncCount,
      hasFailedSync,
      failedSyncCount,
      appVersion: APP_METADATA.version,
      appName: APP_METADATA.name,
    }),
    [themeMode, defaultStorageMode, pendingSyncCount, hasFailedSync, failedSyncCount],
  );

  return (
    <SettingsView
      viewModel={viewModel}
      onSelectTheme={(mode): void => setThemeMode(mode)}
      onSelectStorageMode={(mode): void => setDefaultStorageMode(mode)}
      onOpenFeedback={(): void => router.push('/settings/feedback')}
      onOpenMetrics={(): void => router.push('/settings/metrics')}
      onOpenSyncStatus={(): void => router.push('/settings/sync')}
      onOpenData={(): void => router.push('/settings/data')}
      onOpenDeleteAccount={(): void => router.push('/settings/delete-account')}
    />
  );
}

// ---------------------------------------------------------------------------
// View — pure presentational component.
// ---------------------------------------------------------------------------

export interface SettingsViewProps {
  readonly viewModel: SettingsViewModel;
  readonly onSelectTheme: (mode: ThemeMode) => void;
  readonly onSelectStorageMode: (mode: StorageMode) => void;
  readonly onOpenFeedback: () => void;
  readonly onOpenMetrics: () => void;
  /** Opens the sync status screen (offline queue details). */
  readonly onOpenSyncStatus: () => void;
  readonly onOpenData?: () => void;
  readonly onOpenDeleteAccount: () => void;
}

const THEME_OPTIONS: readonly { readonly mode: ThemeMode; readonly label: string; readonly icon: string }[] = [
  { mode: 'light', label: 'Light', icon: 'sunny-outline' },
  { mode: 'dark', label: 'Dark', icon: 'moon-outline' },
  { mode: 'system', label: 'Follow system', icon: 'phone-portrait-outline' },
];

const STORAGE_MODE_ORDER: readonly StorageMode[] = [
  'local_only',
  'cloud_private',
  'shared_with_group',
  'delete_after_extraction',
];

export function SettingsView({
  viewModel,
  onSelectTheme,
  onSelectStorageMode,
  onOpenFeedback,
  onOpenMetrics,
  onOpenSyncStatus,
  onOpenData,
  onOpenDeleteAccount,
}: SettingsViewProps): JSX.Element {
  return (
    <Screen scrollable safeArea>
      <Stack gap="xl" align="stretch" style={{ padding: spacing.xl }}>
        {/* Header */}
        <Stack gap="xs" align="stretch">
          <Text variant="screenTitle" color="primary" accessibilityRole="header">
            Settings
          </Text>
          <Text variant="body" color="secondary">
            Preferences, privacy, and account.
          </Text>
        </Stack>

        {/* Appearance */}
        <SettingsSectionCard title="Appearance" icon="color-palette-outline" accessibilityLabel="Appearance settings">
          <Stack gap="sm" align="stretch">
            <Text variant="caption" color="secondary">
              Theme
            </Text>
            {THEME_OPTIONS.map((option) => {
              const selected = viewModel.themeMode === option.mode;
              return (
                <SettingsRow
                  key={option.mode}
                  icon={option.icon}
                  label={option.label}
                  description={
                    option.mode === 'system'
                      ? 'Match the device light/dark setting'
                      : option.mode === 'light'
                        ? 'Always use the light theme'
                        : 'Always use the dark theme'
                  }
                  selected={selected}
                  onPress={(): void => onSelectTheme(option.mode)}
                  accessibilityLabel={`Set theme to ${option.label}`}
                />
              );
            })}
          </Stack>
        </SettingsSectionCard>

        {/* Receipts */}
        <SettingsSectionCard title="Receipts" icon="receipt-outline" accessibilityLabel="Receipt privacy settings">
          <Stack gap="sm" align="stretch">
            <Text variant="caption" color="secondary">
              Default receipt storage
            </Text>
            {STORAGE_MODE_ORDER.map((mode) => (
              <SettingsRow
                key={mode}
                icon={PRIVACY_DEFAULT_ICONS[mode]}
                label={PRIVACY_DEFAULT_LABELS[mode]}
                description={PRIVACY_DEFAULT_DESCRIPTIONS[mode]}
                selected={viewModel.defaultStorageMode === mode}
                onPress={(): void => onSelectStorageMode(mode)}
                accessibilityLabel={`Set default receipt storage to ${PRIVACY_DEFAULT_LABELS[mode]}`}
              />
            ))}
          </Stack>
        </SettingsSectionCard>

        {/* Sync + Diagnostics */}
        <SettingsSectionCard title="Sync & diagnostics" icon="pulse-outline" accessibilityLabel="Sync and diagnostics">
          <Stack gap="sm" align="stretch">
            <SettingsRow
              icon="sync"
              label="Sync status"
              description={
                viewModel.hasFailedSync
                  ? `${viewModel.failedSyncCount} ${viewModel.failedSyncCount === 1 ? 'change needs' : 'changes need'} your review.`
                  : viewModel.pendingSyncCount > 0
                    ? `${viewModel.pendingSyncCount} ${viewModel.pendingSyncCount === 1 ? 'change' : 'changes'} waiting to sync.`
                    : 'All changes synced. Offline queue and retries live here.'
              }
              chevron
              onPress={onOpenSyncStatus}
              accessibilityLabel="Sync status — opens the offline queue details"
              descriptionColor={viewModel.hasFailedSync ? 'critical' : 'secondary'}
            />
            <SettingsRow
              icon="pulse"
              label="App health"
              description="On-device operational metrics. Privacy-safe: values only."
              chevron
              onPress={onOpenMetrics}
              accessibilityLabel="App health — opens the on-device metrics dashboard"
            />
          </Stack>
        </SettingsSectionCard>

        {/* Data */}
        <SettingsSectionCard title="Data" icon="server-outline" accessibilityLabel="Data and storage">
          <SettingsRow
            icon="download-outline"
            label="Export & storage"
            description="Export a copy of your records, review retention, and remove old local groups safely."
            chevron
            onPress={onOpenData ?? ((): void => undefined)}
            accessibilityLabel="Export and storage — opens data export and retention"
          />
        </SettingsSectionCard>

        {/* Feedback */}
        <SettingsSectionCard title="Feedback" icon="chatbubbles-outline" accessibilityLabel="Feedback">
          <SettingsRow
            icon="chatbubble-outline"
            label="Send feedback"
            description="General notes, feature requests, and bug reports. Personal details are removed automatically before anything is stored on this device."
            chevron
            onPress={onOpenFeedback}
            accessibilityLabel="Send feedback — opens the feedback form"
          />
        </SettingsSectionCard>

        {/* Account */}
        <SettingsSectionCard title="Account" icon="person-outline" accessibilityLabel="Account">
          <SettingsRow
            icon="trash-outline"
            label="Delete account"
            description="Permanently delete your account and data. A 14-day recovery window applies."
            chevron
            onPress={onOpenDeleteAccount}
            accessibilityLabel="Delete account — opens the account deletion flow"
            labelColor="critical"
            iconColorOverride="negative"
          />
        </SettingsSectionCard>

        {/* About */}
        <SettingsSectionCard title="About" icon="information-circle-outline" accessibilityLabel="About">
          <Stack gap="xs" align="stretch">
            <Row gap="sm" align="center">
              <Text variant="body" color="secondary" style={{ flex: 1 }}>
                App name
              </Text>
              <Text variant="bodyStrong" color="primary">
                {viewModel.appName}
              </Text>
            </Row>
            <Row gap="sm" align="center">
              <Text variant="body" color="secondary" style={{ flex: 1 }}>
                Version
              </Text>
              <Text variant="bodyStrong" color="primary">
                {viewModel.appVersion}
              </Text>
            </Row>
            <Text variant="caption" color="muted" style={{ paddingTop: spacing.sm }}>
              Offline-first. Your financial data lives on this device; cloud sync is opt-in per receipt.
            </Text>
          </Stack>
        </SettingsSectionCard>
      </Stack>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Section card
// ---------------------------------------------------------------------------

interface SettingsSectionCardProps {
  readonly title: string;
  readonly icon: string;
  readonly accessibilityLabel?: string;
  readonly children: ReactNode;
}

function SettingsSectionCard({
  title,
  icon,
  accessibilityLabel,
  children,
}: SettingsSectionCardProps): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="sm" padding="lg" accessibilityRole="text" accessibilityLabel={accessibilityLabel ?? title}>
      <Stack gap="md" align="stretch">
        <Row gap="sm" align="center">
          <Icon name={icon} size={theme.iconSizes.md} color={theme.colors.brandPrimary} />
          <Text variant="cardTitle" color="primary">
            {title}
          </Text>
        </Row>
        {children}
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

interface SettingsRowProps {
  readonly icon: string;
  readonly label: string;
  readonly description?: string;
  readonly selected?: boolean;
  readonly chevron?: boolean;
  readonly onPress: () => void;
  readonly accessibilityLabel: string;
  readonly labelColor?: 'primary' | 'critical';
  readonly descriptionColor?: 'secondary' | 'critical';
  readonly iconColorOverride?: 'negative';
}

function SettingsRow({
  icon,
  label,
  description,
  selected,
  chevron,
  onPress,
  accessibilityLabel,
  labelColor = 'primary',
  descriptionColor = 'secondary',
  iconColorOverride,
}: SettingsRowProps): ReactNode {
  const theme = useTheme();
  const iconColor = iconColorOverride === 'negative' ? theme.colors.negative : theme.colors.brandPrimary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: selected ?? false }}
      style={({ pressed }) => ({
        minHeight: 48,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Row gap="md" align="center" style={{ paddingVertical: spacing.sm }}>
        <Row
          gap="sm"
          align="center"
          style={{
            width: 32,
            height: 32,
            borderRadius: theme.borderRadius.full,
            backgroundColor: theme.colors.surfaceMuted,
            justifyContent: 'center',
          }}
        >
          <Icon name={icon} size={theme.iconSizes.sm} color={iconColor} />
        </Row>
        <Stack gap={0} style={{ flex: 1 }}>
          <Text variant="body" color={labelColor}>
            {label}
          </Text>
          {description !== undefined ? (
            <Text variant="caption" color={descriptionColor}>
              {description}
            </Text>
          ) : null}
        </Stack>
        {selected ? (
          <Icon name="checkmark-circle" size={theme.iconSizes.md} color={theme.colors.brandPrimary} />
        ) : chevron ? (
          <Icon name="chevron-forward" size={theme.iconSizes.md} color={theme.colors.textMuted} />
        ) : null}
      </Row>
    </Pressable>
  );
}
