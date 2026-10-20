/**
 * MetricsDashboardScreen — the on-device production-monitoring dashboard
 * (Prompt 81's presentation layer; closes the documented "monitoring
 * dashboard UI" gap from the Phase 9 audit).
 *
 * Shows the nine monitored metrics with their latest observed value,
 * target, and alert state — read through `GetMetricsDashboardUseCase`
 * from the LOCAL, redacted metric cache (`monitoring_metrics`).
 *
 * PRIVACY: the dashboard renders values + labels only. Even redacted
 * payloads are intentionally NOT displayed (they never leave the use
 * case's dashboard projection — see `get-metrics-dashboard.usecase.ts`).
 *
 * HONEST EMPTY STATE: until runtime telemetry sources (crash reporter,
 * sync outcome feeds, OCR accuracy correction aggregation) are wired to
 * `RecordMetricUseCase`, a fresh install has zero samples — the screen
 * says exactly that instead of inventing numbers.
 */

import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView } from 'react-native';

import type { MetricsDashboard } from '@application/monitoring';
import {
  Badge,
  Card,
  Icon,
  Row,
  Stack,
  Text,
  useTheme,
  spacing,
} from '@presentation/design-system';
import { tryGetAppServices, useAppServicesReady } from '@store/services-registry';

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export function MetricsDashboardScreen(): JSX.Element {
  const servicesReady = useAppServicesReady();
  const [dashboard, setDashboard] = useState<MetricsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const services = tryGetAppServices();
    if (services === null) return;
    setLoading(true);
    try {
      const result = await services.monitoring.getMetricsDashboard.execute();
      setDashboard(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load metrics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, servicesReady]);

  return (
    <MetricsDashboardView
      dashboard={dashboard}
      loading={loading}
      error={error}
      onRefresh={() => {
        void load();
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// View — pure presentational component
// ---------------------------------------------------------------------------

export interface MetricsDashboardViewProps {
  readonly dashboard: MetricsDashboard | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onRefresh: () => void;
}

export function MetricsDashboardView({
  dashboard,
  loading,
  error,
  onRefresh,
}: MetricsDashboardViewProps): JSX.Element {
  const theme = useTheme();

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={theme.colors.brandPrimary} />
      }
    >
      <Stack gap="xs" align="stretch">
        <Text variant="screenTitle" color="primary" accessibilityRole="header">
          App health
        </Text>
        <Text variant="body" color="secondary">
          On-device operational metrics — crash-free sessions, sync success,
          OCR accuracy, and latency. Privacy-safe: values and labels only.
        </Text>
      </Stack>

      {error !== null ? (
        <Card elevation="sm" padding="md" accessibilityRole="alert">
          <Row gap="md" align="center">
            <Icon
              name="cloud-offline-outline"
              size={theme.iconSizes.lg}
              color={theme.colors.negative}
            />
            <Stack gap={0} style={{ flex: 1 }}>
              <Text variant="bodyStrong" color="primary">
                Metrics could not load
              </Text>
              <Text variant="caption" color="secondary">
                {error}
              </Text>
            </Stack>
          </Row>
        </Card>
      ) : null}

      {loading && dashboard === null ? (
        <Stack gap="md" align="center" style={{ paddingVertical: spacing.xl }}>
          <ActivityIndicator size="large" color={theme.colors.brandPrimary} />
          <Text variant="body" color="secondary">
            Loading metrics…
          </Text>
        </Stack>
      ) : null}

      {dashboard !== null ? <AlertSummaryCard dashboard={dashboard} /> : null}

      {dashboard !== null && dashboard.entries.every((e) => e.latestValue === null) ? (
        <NoSamplesCard />
      ) : null}

      {dashboard !== null ? (
        <Stack gap="md" align="stretch">
          <Text variant="sectionTitle" color="primary" accessibilityRole="header">
            Metrics
          </Text>
          {dashboard.entries.map((entry) => (
            <MetricRow
              key={entry.key}
              label={entry.label}
              value={formatMetricValue(entry.latestValue, entry.unit)}
              latestAt={entry.latestAt}
              meetsTarget={entry.meetsTarget}
              alerting={entry.alerting}
              hasValue={entry.latestValue !== null}
            />
          ))}
        </Stack>
      ) : null}
    </ScrollView>
  );
}

function AlertSummaryCard({ dashboard }: { readonly dashboard: MetricsDashboard }): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="sm" padding="lg" accessibilityRole="text">
      <Row gap="md" align="center">
        <Icon
          name={dashboard.alertCount > 0 ? 'warning-outline' : 'shield-checkmark-outline'}
          size={theme.iconSizes.xl}
          color={dashboard.alertCount > 0 ? theme.colors.warning : theme.colors.positive}
        />
        <Stack gap={0} style={{ flex: 1 }}>
          <Text variant="cardTitle" color="primary">
            {dashboard.alertCount === 0
              ? 'No alerts firing'
              : `${dashboard.alertCount} alert${dashboard.alertCount === 1 ? '' : 's'} firing`}
          </Text>
          <Text variant="caption" color="muted">
            Snapshot generated {new Date(dashboard.generatedAt).toLocaleTimeString()}
          </Text>
        </Stack>
      </Row>
    </Card>
  );
}

function NoSamplesCard(): ReactNode {
  const theme = useTheme();
  return (
    <Card elevation="none" padding="lg" accessibilityRole="text">
      <Stack gap="xs" align="center">
        <Icon name="pulse-outline" size={theme.iconSizes.xl} color={theme.colors.textMuted} />
        <Text variant="bodyStrong" color="primary">
          No samples recorded yet on this device
        </Text>
        <Text variant="caption" color="muted" style={{ textAlign: 'center' }}>
          Metrics appear once the app records real operational outcomes
          (sync results, OCR corrections, crash reports). Values are never
          estimated.
        </Text>
      </Stack>
    </Card>
  );
}

interface MetricRowProps {
  readonly label: string;
  readonly value: string;
  readonly latestAt: string | null;
  readonly meetsTarget: boolean;
  readonly alerting: boolean;
  readonly hasValue: boolean;
}

function MetricRow({
  label,
  value,
  latestAt,
  meetsTarget,
  alerting,
  hasValue,
}: MetricRowProps): ReactNode {
  return (
    <Card elevation="sm" padding="md">
      <Row gap="md" align="center">
        <Stack gap={0} style={{ flex: 1 }}>
          <Text variant="bodyStrong" color="primary">
            {label}
          </Text>
          <Text variant="caption" color="muted">
            {hasValue && latestAt !== null
              ? `Last sample ${new Date(latestAt).toLocaleString()}`
              : 'No samples yet'}
          </Text>
        </Stack>
        <Text
          variant="amountMedium"
          color={hasValue ? (meetsTarget ? 'positive' : 'warning') : 'muted'}
        >
          {hasValue ? value : '—'}
        </Text>
        {alerting ? (
          <Badge variant="negative" label="ALERT" accessibilityLabel={`${label} is alerting`} />
        ) : null}
      </Row>
    </Card>
  );
}

/** Human-readable metric value ("99.2 %", "312 ms"). */
function formatMetricValue(
  value: number | null,
  unit: 'ratio' | 'latency_ms',
): string {
  if (value === null) return '—';
  if (unit === 'ratio') {
    return `${(value * 100).toFixed(1)} %`;
  }
  return `${Math.round(value)} ms`;
}
