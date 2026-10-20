/**
 * SyncStatusIndicator — compact sync state indicator for headers.
 *
 * Renders a `StatusDot` plus an optional count of pending mutations.
 * Designed to sit in a navigation header so the user always knows
 * whether their data is synced.
 *
 * States:
 *   - idle    (green)  — `pendingSyncCount === 0` and no failures.
 *   - pending (amber)  — `pendingSyncCount > 0` and no failures.
 *   - failed  (red)    — `hasFailedSync === true` (takes precedence).
 *
 * Reads from the app-state store so any screen that mounts this
 * indicator reflects the latest sync status without prop drilling.
 */

import { useAppState } from '@store/app-state-store';

import { Row } from '../design-system/components/Row';
import { StatusDot } from '../design-system/components/StatusDot';
import type { StatusDotVariant } from '../design-system/components/StatusDot';
import { Text } from '../design-system/components/Text';

export interface SyncStatusIndicatorProps {
  /** Override the values read from the store (useful for tests / preview). */
  readonly pendingSyncCountOverride?: number;
  readonly hasFailedSyncOverride?: boolean;
}

type SyncState = 'idle' | 'pending' | 'failed';

interface ResolvedSync {
  readonly state: SyncState;
  readonly dotVariant: StatusDotVariant;
  readonly label: string;
}

function resolveSync(
  pendingSyncCount: number,
  hasFailedSync: boolean,
): ResolvedSync {
  if (hasFailedSync) {
    return { state: 'failed', dotVariant: 'syncFailed', label: 'Sync failed' };
  }
  if (pendingSyncCount > 0) {
    return { state: 'pending', dotVariant: 'syncPending', label: 'Syncing' };
  }
  return { state: 'idle', dotVariant: 'syncComplete', label: 'Synced' };
}

export function SyncStatusIndicator({
  pendingSyncCountOverride,
  hasFailedSyncOverride,
}: SyncStatusIndicatorProps): JSX.Element {
  const storePending = useAppState((s) => s.pendingSyncCount);
  const storeFailed = useAppState((s) => s.hasFailedSync);

  const pendingSyncCount = pendingSyncCountOverride ?? storePending;
  const hasFailedSync = hasFailedSyncOverride ?? storeFailed;

  const resolved = resolveSync(pendingSyncCount, hasFailedSync);

  const a11yLabel =
    resolved.state === 'pending'
      ? `${resolved.label}, ${pendingSyncCount} pending`
      : resolved.label;

  return (
    <Row
      gap="xs"
      align="center"
      accessibilityRole="header"
      accessibilityLabel={a11yLabel}
    >
      <StatusDot variant={resolved.dotVariant} accessibilityLabel={resolved.label} />
      <Text variant="caption" color="secondary">
        {resolved.state === 'pending' && pendingSyncCount > 0
          ? `${resolved.label} · ${pendingSyncCount}`
          : resolved.label}
      </Text>
    </Row>
  );
}
