/**
 * Data & storage — export, retention review, and safe local deletion.
 *
 * Everything here is local-first: the export reads SQLite, the retention
 * assessment reads SQLite, and deletion only touches this device. No
 * network call is made.
 *
 * Deletion rules (enforced in `DeleteLocalGroupCopyUseCase`, explained in
 * the UI):
 *   - cloud-linked groups are protected (a sync pull would restore them);
 *   - unsettled balances / pending confirmations block deletion;
 *   - only groups past the retention period are offered.
 */

import { File, Paths } from 'expo-file-system';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Share } from 'react-native';

import type { RetentionRow } from '@application/retention/assess-retention.usecase';
import { Button } from '@presentation/design-system/components/Button';
import { Card } from '@presentation/design-system/components/Card';
import { Icon } from '@presentation/design-system/components/Icon';
import { Row } from '@presentation/design-system/components/Row';
import { Screen } from '@presentation/design-system/components/Screen';
import { Skeleton } from '@presentation/design-system/components/Skeleton';
import { Stack } from '@presentation/design-system/components/Stack';
import { Text } from '@presentation/design-system/components/Text';
import { useTheme } from '@presentation/design-system/theme';
import { spacing } from '@presentation/design-system/tokens';
import {
  isCloudSyncConfigured,
  tryGetAppServices,
  useAppServicesReady,
} from '@store/services-registry';
import { buildReportHtml, collectReportRows } from '@application/export/financial-report';
import { useGroupStore } from '@store/group-store';
import { RETENTION_OPTIONS, useRetentionStore } from '@store/retention-store';

export interface DataStorageViewProps {
  readonly cloudSyncEnabled: boolean;
  readonly retentionDays: number;
  readonly onChangeRetention: (days: number) => void;
  readonly rows: readonly RetentionRow[];
  readonly loading: boolean;
  readonly busy: boolean;
  readonly message: string | null;
  readonly onExportJson: () => void;
  readonly onExportCsv: () => void;
  readonly onExportPdf?: () => void;
  readonly onExportXlsx?: () => void;
  readonly onRemoveLocalCopy: (row: RetentionRow) => void;
}

function stateLabel(row: RetentionRow): string {
  switch (row.state) {
    case 'eligible':
      return 'Ready to remove';
    case 'too_recent':
      return row.daysUntilEligible === 1 ? 'Eligible in 1 day' : `Eligible in ${row.daysUntilEligible} days`;
    case 'protected':
      return 'Protected';
  }
}

function stateTone(row: RetentionRow): 'positive' | 'warning' | 'secondary' {
  switch (row.state) {
    case 'eligible':
      return 'positive';
    case 'too_recent':
      return 'warning';
    case 'protected':
      return 'secondary';
  }
}

export function DataStorageView({
  cloudSyncEnabled,
  retentionDays,
  onChangeRetention,
  rows,
  loading,
  busy,
  message,
  onExportJson,
  onExportCsv,
  onExportPdf,
  onExportXlsx,
  onRemoveLocalCopy,
}: DataStorageViewProps): JSX.Element {
  const theme = useTheme();
  const eligible = useMemo(() => rows.filter((row) => row.state === 'eligible'), [rows]);

  return (
    <Screen scrollable safeArea>
      <Stack gap="xl" align="stretch" style={{ padding: spacing.xl }}>
        <Stack gap="xs" align="stretch">
          <Text variant="screenTitle" color="primary" accessibilityRole="header">
            Data & storage
          </Text>
          <Text variant="body" color="secondary">
            Your records live on this device. Export a copy, review what is old enough to
            clean up, or remove a local group — nothing here needs the internet.
          </Text>
        </Stack>

        <Card elevation="sm" padding="lg">
          <Stack gap="md" align="stretch">
            <Row gap="sm" align="center">
              <Icon name="download-outline" size={theme.iconSizes.lg} color={theme.colors.brandPrimary} />
              <Text variant="cardTitle" color="primary" style={{ flex: 1 }}>
                Export your data
              </Text>
            </Row>
            <Text variant="caption" color="secondary">
              JSON is a complete backup (groups, members, expenses, settlements). CSV is
              expenses only, for spreadsheets and accounting tools. Receipt images and
              tokens are never included.
            </Text>
            <Row gap="sm" align="center">
              <Button
                label="Export JSON"
                variant="secondary"
                size="sm"
                onPress={onExportJson}
                disabled={busy}
                accessibilityLabel="Export a JSON backup of your local data"
                icon="document-text-outline"
              />
              <Button
                label="Export CSV"
                variant="ghost"
                size="sm"
                onPress={onExportCsv}
                disabled={busy}
                accessibilityLabel="Export expenses as CSV"
                icon="grid-outline"
              />
            </Row>
            {onExportPdf !== undefined && onExportXlsx !== undefined ? (
            <Row gap="sm" align="center">
              <Button
                label="PDF report"
                variant="secondary"
                size="sm"
                onPress={onExportPdf}
                disabled={busy}
                accessibilityLabel="Export a PDF expense report"
                icon="document-outline"
              />
              <Button
                label="XLSX workbook"
                variant="ghost"
                size="sm"
                onPress={onExportXlsx}
                disabled={busy}
                accessibilityLabel="Export an XLSX expense workbook"
                icon="grid-outline"
              />
            </Row>
            ) : null}
            {message !== null ? (
              <Text variant="caption" color="secondary" accessibilityRole="alert">
                {message}
              </Text>
            ) : null}
          </Stack>
        </Card>

        <Stack gap="md" align="stretch">
          <Text variant="sectionTitle" color="primary" accessibilityRole="header">
            Retention
          </Text>
          <Text variant="caption" color="secondary">
            A group becomes eligible after its configured quiet period
            ({retentionDays} days). Nothing is deleted automatically, and groups with money
            outstanding or pending settlements are never eligible.
          </Text>
          <Row gap="sm" align="center">
            {RETENTION_OPTIONS.map((option) => (
              <Button
                key={option.days}
                label={option.label}
                variant={retentionDays === option.days ? 'primary' : 'ghost'}
                size="sm"
                onPress={() => onChangeRetention(option.days)}
                accessibilityLabel={`Set retention to ${option.label}`}
              />
            ))}
          </Row>

          {cloudSyncEnabled ? (
            <Card elevation="none" padding="md" accessibilityRole="text">
              <Text variant="caption" color="secondary">
                Cloud sync is configured, so local copies are protected from removal — a
                sync would restore them. Use “Leave group” for shared groups.
              </Text>
            </Card>
          ) : null}

          {loading ? (
            <Stack gap="sm" align="stretch" accessibilityLabel="Loading retention review">
              <Skeleton width="100%" height={72} />
              <Skeleton width="100%" height={72} />
            </Stack>
          ) : null}

          {!loading && rows.length === 0 ? (
            <Card elevation="none" padding="lg">
              <Text variant="body" color="secondary">
                No local groups yet. Once you add groups and expenses, they will appear here
                with their retention status.
              </Text>
            </Card>
          ) : null}

          {!loading
            ? rows.map((row) => (
                <Card key={row.groupId} elevation="sm" padding="lg">
                  <Stack gap="sm" align="stretch">
                    <Row gap="sm" align="center">
                      <Text variant="cardTitle" color="primary" style={{ flex: 1 }}>
                        {row.groupName}
                      </Text>
                      <Text variant="label" color={stateTone(row)}>
                        {stateLabel(row)}
                      </Text>
                    </Row>
                    <Text variant="caption" color="secondary">
                      Last activity {row.lastActivityAt.slice(0, 10)}
                      {row.hasOutstandingBalance ? ' · balances outstanding' : ''}
                    </Text>
                    {row.reasons.map((reason) => (
                      <Text key={reason} variant="caption" color="muted">
                        • {reason}
                      </Text>
                    ))}
                    {row.state === 'eligible' && !cloudSyncEnabled ? (
                      <Button
                        label="Remove local copy"
                        variant="ghost"
                        size="sm"
                        onPress={() => onRemoveLocalCopy(row)}
                        disabled={busy}
                        accessibilityLabel={`Remove the local copy of ${row.groupName}`}
                        icon="trash-outline"
                      />
                    ) : null}
                  </Stack>
                </Card>
              ))
            : null}

          {!cloudSyncEnabled && eligible.length > 0 ? (
            <Text variant="caption" color="muted">
              Removing a local copy deletes it from this device only and writes an audit
              entry. Export first if you may need the records later.
            </Text>
          ) : null}
        </Stack>

        <Card elevation="none" padding="lg">
          <Stack gap="xs" align="stretch">
            <Text variant="cardTitle" color="primary">
              What is never deleted
            </Text>
            <Text variant="caption" color="secondary">
              Unsettled balances, settlements awaiting confirmation, and any change that has
              not reached the sync queue are always protected. Account deletion is a
              separate, deliberate flow with its own recovery window.
            </Text>
          </Stack>
        </Card>
      </Stack>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export function DataStorageScreen(): JSX.Element {
  const servicesReady = useAppServicesReady();
  const groups = useGroupStore((s) => s.groups);
  const leaveGroup = useGroupStore((s) => s.leaveGroup);
  const cloudSyncEnabled = isCloudSyncConfigured();
  const retentionDays = useRetentionStore((s) => s.retentionDays);
  const setRetentionDays = useRetentionStore((s) => s.setRetentionDays);

  const [rows, setRows] = useState<readonly RetentionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const services = tryGetAppServices();
    if (services === null) return;
    setLoading(true);
    try {
      const assessment = await services.data.assessRetention.execute({
        groupIds: groups.map((group) => group.id),
        cloudSyncEnabled,
        config: { retentionDays },
      });
      setRows(assessment.rows);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not review retention.');
    } finally {
      setLoading(false);
    }
  }, [groups, cloudSyncEnabled, retentionDays]);

  useEffect(() => {
    if (!servicesReady) return;
    void refresh();
  }, [refresh, servicesReady]);

  const exportPayload = useCallback(
    async (format: 'json' | 'csv'): Promise<void> => {
      const services = tryGetAppServices();
      if (services === null) return;
      setBusy(true);
      setMessage(null);
      try {
        const exported = await services.data.exportLocalData.execute({
          groupIds: groups.map((group) => group.id),
        });
        const content = format === 'json' ? exported.json : exported.csv;
        const name = `billlens-export-${exported.exportedAt.slice(0, 10)}.${format}`;

        if (Platform.OS === 'web') {
          setMessage(
            'File export is available in the mobile app. The backup was generated successfully.',
          );
          return;
        }

        const file = new File(Paths.cache, name);
        file.create({ overwrite: true });
        file.write(content);
        await Share.share({ url: file.uri, title: name });
        setMessage(
          `Exported ${exported.counts.groups} groups · ${exported.counts.expenses} expenses${
            exported.truncated ? ' (truncated at the export limit)' : ''
          }.`,
        );
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Export failed.');
      } finally {
        setBusy(false);
      }
    },
    [groups],
  );

  const exportReport = useCallback(
    async (kind: 'pdf' | 'xlsx'): Promise<void> => {
      const services = tryGetAppServices();
      if (services === null) return;
      setBusy(true);
      setMessage(null);
      try {
        const exported = await services.data.exportLocalData.execute({
          groupIds: groups.map((group) => group.id),
        });
        const base = `billlens-report-${exported.exportedAt.slice(0, 10)}`;
        if (Platform.OS === 'web') {
          setMessage('PDF and XLSX sharing is available in the mobile app.');
          return;
        }

        if (kind === 'pdf') {
          // Lazy: expo-print is only loaded when the user asks for a PDF.
          const { printToFileAsync } = await import('expo-print');
          const { uri } = await printToFileAsync({ html: buildReportHtml(exported) });
          await Share.share({ url: uri, title: `${base}.pdf` });
        } else {
          // Lazy: the spreadsheet writer is a separate JS chunk.
          const XLSX = await import('xlsx');
          const sheet = XLSX.utils.json_to_sheet([...collectReportRows(exported)]);
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, sheet, 'Expenses');
          const data = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
          const file = new File(Paths.cache, `${base}.xlsx`);
          file.create({ overwrite: true });
          file.write(new Uint8Array(data));
          await Share.share({ url: file.uri, title: `${base}.xlsx` });
        }
        setMessage(`Exported ${exported.counts.expenses} expenses.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Export failed.');
      } finally {
        setBusy(false);
      }
    },
    [groups],
  );

  const removeLocalCopy = useCallback(
    (row: RetentionRow): void => {
      const perform = async (): Promise<void> => {
        const services = tryGetAppServices();
        if (services === null) return;
        setBusy(true);
        setMessage(null);
        try {
          await services.data.deleteLocalGroupCopy.execute({
            groupId: row.groupId,
            actorId: 'local-user',
            cloudSyncEnabled,
          });
          leaveGroup(row.groupId);
          setMessage(`${row.groupName} was removed from this device.`);
          await refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Could not remove the group.');
        } finally {
          setBusy(false);
        }
      };

      Alert.alert(
        'Remove local copy?',
        `${row.groupName} will be deleted from this device only. Export a copy first if you may need these records.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: (): void => void perform() },
        ],
      );
    },
    [cloudSyncEnabled, leaveGroup, refresh],
  );

  return (
    <DataStorageView
      cloudSyncEnabled={cloudSyncEnabled}
      retentionDays={retentionDays}
      onChangeRetention={setRetentionDays}
      rows={rows}
      loading={loading}
      busy={busy}
      message={message}
      onExportJson={(): void => void exportPayload('json')}
      onExportCsv={(): void => void exportPayload('csv')}
      onExportPdf={(): void => void exportReport('pdf')}
      onExportXlsx={(): void => void exportReport('xlsx')}
      onRemoveLocalCopy={removeLocalCopy}
    />
  );
}
