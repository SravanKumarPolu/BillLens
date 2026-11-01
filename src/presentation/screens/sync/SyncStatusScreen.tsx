/**
 * SyncStatusScreen — detailed sync status and failed-operations list.
 *
 * Phase 7 UI + v2.6.0 bidirectional sync.
 *
 * Shows:
 *   - Current sync status (idle / running / offline / failed / conflict)
 *   - Pending operation count + honest download state
 *   - v2.6.0: REMOTE CONFLICTS awaiting the user's decision (both
 *     versions preserved; "keep mine" / "use cloud" — never auto-merged)
 *   - Failed operations list with retry buttons
 *   - "Retry all" / "Sync now" / v2.6.0 "Full re-sync" (cursor reset)
 *
 * Reads from the app-state store (which is wired to the
 * SyncCoordinator in the production app).
 */

import { Pressable, ScrollView } from 'react-native';

import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Icon } from '@presentation/design-system/components/Icon';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Stack } from '@presentation/design-system/components/Stack';
import { StatusDot } from '@presentation/design-system/components/StatusDot';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import { useAppState } from '@store/app-state-store';

export interface FailedSyncOperationViewModel {
  readonly id: string;
  readonly entityType: string;
  readonly entityId?: string;
  readonly operation: string;
  readonly errorMessage: string;
  readonly retryCount: number;
}

/**
 * A download-detected conflict awaiting the user's decision (v2.6.0).
 * `summary` is a plain-language, honest description of the divergence —
 * never a raw JSON dump.
 */
export interface RemoteConflictViewModel {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly summary: string;
}

export interface SyncStatusScreenProps {
  readonly failedOperations: readonly FailedSyncOperationViewModel[];
  readonly onRetryOperation: (operationId: string) => void;
  readonly onRetryAll: () => void;
  readonly onSyncNow: () => void;
  readonly syncing: boolean;
  /** v2.6.0 — unresolved remote conflicts + the user's decisions. */
  readonly remoteConflicts?: readonly RemoteConflictViewModel[];
  readonly onResolveConflict?: (conflictId: string, resolution: 'keep_local' | 'keep_cloud') => void;
  /** v2.6.0 — full re-sync (cursor reset + fresh download). */
  readonly onFullResync?: () => void;
  /** v2.6.0 — last download error, surfaced honestly (never hidden). */
  readonly downloadError?: string | null;
  /** Optional close affordance (route header provides one on native). */
  readonly onClose?: () => void;
}

const ENTITY_LABELS: Record<string, string> = {
  group: 'group',
  group_member: 'member',
  group_invite: 'invite',
  expense: 'expense',
  expense_payer: 'expense payer',
  expense_split: 'expense share',
  settlement: 'settlement',
};

export function SyncStatusScreen({
  failedOperations,
  onRetryOperation,
  onRetryAll,
  onSyncNow,
  syncing,
  remoteConflicts,
  onResolveConflict,
  onFullResync,
  downloadError,
  onClose,
}: SyncStatusScreenProps): JSX.Element {
  void onClose; // reserved: the native route header owns the close affordance
  const theme = useTheme();
  const isOnline = useAppState((s) => s.isOnline);
  const pendingCount = useAppState((s) => s.pendingSyncCount);
  const hasFailed = useAppState((s) => s.hasFailedSync);
  const failedCount = failedOperations.length;
  const conflicts = remoteConflicts ?? [];
  const conflictCount = conflicts.length;

  const statusLabel = !isOnline
    ? 'Offline'
    : conflictCount > 0 || hasFailed
      ? 'Needs your attention'
      : pendingCount > 0
        ? 'Syncing'
        : downloadError
          ? 'Sync issue'
          : 'All synced';
  const dotVariant =
    !isOnline || hasFailed || conflictCount > 0 || downloadError
      ? 'syncFailed'
      : pendingCount > 0
        ? 'syncPending'
        : 'syncComplete';

  return (
    <Screen scrollable safeArea>
      <Stack gap="xl" align="stretch" style={{ padding: spacing.xl }}>
        <Text variant="screenTitle" color="primary" accessibilityRole="header">
          Sync status
        </Text>

        <Card elevation="md" padding="lg">
          <Stack gap="md" align="stretch">
            <Row gap="md" align="center" >
              <Row gap="sm" align="center">
                <StatusDot variant={dotVariant} accessibilityLabel={statusLabel} />
                <Text variant="bodyStrong" color="primary">{statusLabel}</Text>
              </Row>
              <Text variant="caption" color="muted">
                {pendingCount > 0 ? `${pendingCount} pending` : 'No pending changes'}
              </Text>
            </Row>
            {!isOnline && (
              <Text variant="caption" color="muted">
                Your changes will sync automatically when you reconnect.
              </Text>
            )}
            {downloadError !== null && downloadError !== undefined && downloadError !== '' && (
              <Text variant="caption" color="negative" accessibilityLiveRegion="polite">
                Last download issue: {downloadError}
              </Text>
            )}
            {conflictCount > 0 && (
              <Text variant="caption" color="negative" accessibilityLiveRegion="polite">
                {conflictCount} remote {conflictCount === 1 ? 'change' : 'changes'} conflict with your edits — review below.
              </Text>
            )}
            <Button
              label="Sync now"
              variant="primary"
              icon="sync"
              onPress={onSyncNow}
              loading={syncing}
              disabled={!isOnline || syncing}
              accessibilityLabel="Manually trigger a sync"
            />
          </Stack>
        </Card>

        {conflictCount > 0 && onResolveConflict !== undefined && (
          <Stack gap="md" align="stretch">
            <Row gap="md" align="center" >
              <Text variant="sectionTitle" color="primary" accessibilityRole="header">
                Review conflicts
              </Text>
            </Row>
            <Text variant="caption" color="muted">
              These were changed by someone else while you were editing. Nothing was overwritten — choose which version to keep.
            </Text>
            <ScrollView style={{ maxHeight: 420 }}>
              <Stack gap="sm" align="stretch">
                {conflicts.map((conflict) => (
                  <Card key={conflict.id} elevation="sm" padding="md">
                    <Stack gap="sm" align="stretch">
                      <Row gap="sm" align="center">
                        <StatusDot variant="syncPending" accessibilityLabel="Conflict" />
                        <Text variant="bodyStrong" color="primary">
                          {ENTITY_LABELS[conflict.entityType] ?? conflict.entityType}
                        </Text>
                      </Row>
                      <Text variant="caption" color="muted">{conflict.summary}</Text>
                      <Row gap="sm" align="center">
                        <Button
                          label="Keep mine"
                          variant="secondary"
                          size="sm"
                          onPress={() => onResolveConflict(conflict.id, 'keep_local')}
                          accessibilityLabel={`Keep my version of this ${ENTITY_LABELS[conflict.entityType] ?? conflict.entityType}`}
                        />
                        <Button
                          label="Use cloud"
                          variant="secondary"
                          size="sm"
                          onPress={() => onResolveConflict(conflict.id, 'keep_cloud')}
                          accessibilityLabel={`Use the cloud version of this ${ENTITY_LABELS[conflict.entityType] ?? conflict.entityType}`}
                        />
                      </Row>
                    </Stack>
                  </Card>
                ))}
              </Stack>
            </ScrollView>
          </Stack>
        )}

        {failedCount > 0 && (
          <Stack gap="md" align="stretch">
            <Row gap="md" align="center" >
              <Text variant="sectionTitle" color="primary" accessibilityRole="header">
                Failed operations
              </Text>
              <Button label="Retry all" variant="secondary" size="sm" icon="refresh" onPress={onRetryAll} accessibilityLabel="Retry all failed operations" />
            </Row>
            <ScrollView style={{ maxHeight: 400 }}>
              <Stack gap="sm" align="stretch">
                {failedOperations.map((op) => (
                  <Card key={op.id} elevation="sm" padding="md">
                    <Stack gap="xs" align="stretch">
                      <Row gap="sm" align="center" >
                        <Text variant="bodyStrong" color="primary">
                          {op.operation} {op.entityType}
                        </Text>
                        <StatusDot variant="syncFailed" accessibilityLabel="Failed" />
                      </Row>
                      <Text variant="caption" color="muted">{op.errorMessage}</Text>
                      <Text variant="caption" color="muted">
                        Retried {op.retryCount} {op.retryCount === 1 ? 'time' : 'times'}
                      </Text>
                      <Pressable
                        onPress={() => onRetryOperation(op.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Retry this ${op.operation} operation`}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingTop: spacing.xs }}
                      >
                        <Icon name="refresh" size={theme.iconSizes.sm} color={theme.colors.brandPrimary} />
                        <Text variant="caption" color="primary" style={{ fontWeight: '600' }}>Retry</Text>
                      </Pressable>
                    </Stack>
                  </Card>
                ))}
              </Stack>
            </ScrollView>
          </Stack>
        )}

        {onFullResync !== undefined && (
          <Card elevation="sm" padding="lg">
            <Stack gap="sm" align="stretch">
              <Text variant="bodyStrong" color="primary">Full re-sync</Text>
              <Text variant="caption" color="muted">
                Re-downloads everything from the cloud. Safe — nothing is duplicated or lost. Use it if sync looks stuck.
              </Text>
              <Button
                label="Re-sync from cloud"
                variant="secondary"
                size="sm"
                icon="refresh"
                onPress={onFullResync}
                disabled={!isOnline || syncing}
                accessibilityLabel="Re-download all data from the cloud"
              />
            </Stack>
          </Card>
        )}

        <Text variant="caption" color="muted" style={{ textAlign: 'center' }}>
          BillLens syncs your data automatically when you&apos;re online. Your offline changes are never lost.
        </Text>
      </Stack>
    </Screen>
  );
}
