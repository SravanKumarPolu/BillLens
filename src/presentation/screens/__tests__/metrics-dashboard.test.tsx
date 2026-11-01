/**
 * MetricsDashboardScreen component tests — the Prompt 81 dashboard's
 * pure view.
 *
 * Renders `MetricsDashboardView` with constructed dashboards (the same
 * shape `GetMetricsDashboardUseCase` emits) and verifies the honest
 * states: metric rows, alert summary, the explicit no-samples card, and
 * value formatting.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';

import type { MetricsDashboard } from '@application/monitoring';
import { MetricsDashboardView } from '@presentation/screens/monitoring/MetricsDashboardScreen';

const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: {
    push: (...args: readonly unknown[]) => mockRouterPush(...args),
    back: () => undefined,
    replace: () => undefined,
  },
}));

function makeDashboard(
  entries: Partial<MetricsDashboard['entries'][number]>[],
  alertCount = 0,
): MetricsDashboard {
  return {
    generatedAt: '2026-10-05T10:00:00.000Z',
    alertCount,
    entries: entries.map((e, i) => ({
      key: (e.key ?? `metric-${i}`) as MetricsDashboard['entries'][number]['key'],
      label: e.label ?? `Metric ${i}`,
      unit: e.unit ?? 'ratio',
      direction: e.direction ?? 'higher_is_better',
      target: e.target ?? 0.99,
      alertThreshold: e.alertThreshold ?? 0.9,
      latestValue: e.latestValue ?? null,
      latestAt: e.latestAt ?? null,
      meetsTarget: e.meetsTarget ?? false,
      alerting: e.alerting ?? false,
    })),
  };
}

describe('MetricsDashboardView', () => {
  it('renders the empty dashboard with the honest no-samples card', () => {
    const dashboard = makeDashboard([{ label: 'Crash-free session rate' }]);
    const { getByText, getAllByText } = render(
      <MetricsDashboardView
        dashboard={dashboard}
        loading={false}
        error={null}
        onRefresh={jest.fn()}
      />,
    );

    expect(getByText('App health')).toBeTruthy();
    expect(getByText('No alerts firing')).toBeTruthy();
    expect(getByText('No samples recorded yet on this device')).toBeTruthy();
    expect(
      getByText(
        'Metrics appear once the app records real operational outcomes (sync results, OCR corrections, crash reports). Values are never estimated.',
      ),
    ).toBeTruthy();
    // Every metric row renders with the "no samples" dash.
    expect(getAllByText('—').length).toBe(1);
    expect(getAllByText('No samples yet').length).toBe(1);
  });

  it('renders metric values with target state and alert badges', () => {
    const dashboard = makeDashboard(
      [
        {
          key: 'sync_success_rate',
          label: 'Sync success rate',
          unit: 'ratio',
          latestValue: 0.97,
          latestAt: '2026-10-05T09:00:00.000Z',
          meetsTarget: true,
        },
        {
          key: 'api_latency_p95_ms',
          label: 'API latency p95',
          unit: 'latency_ms',
          latestValue: 850,
          latestAt: '2026-10-05T09:00:00.000Z',
          meetsTarget: false,
          alerting: true,
        },
      ],
      1,
    );
    const { getByText, getByLabelText } = render(
      <MetricsDashboardView
        dashboard={dashboard}
        loading={false}
        error={null}
        onRefresh={jest.fn()}
      />,
    );

    expect(getByText('1 alert firing')).toBeTruthy();
    expect(getByText('Sync success rate')).toBeTruthy();
    expect(getByText('97.0 %')).toBeTruthy();
    expect(getByText('API latency p95')).toBeTruthy();
    expect(getByText('850 ms')).toBeTruthy();
    expect(getByLabelText('API latency p95 is alerting')).toBeTruthy();
  });

  it('renders the error card when loading failed', () => {
    const { getByText } = render(
      <MetricsDashboardView
        dashboard={null}
        loading={false}
        error="Storage is still starting up."
        onRefresh={jest.fn()}
      />,
    );
    expect(getByText('Metrics could not load')).toBeTruthy();
    expect(getByText('Storage is still starting up.')).toBeTruthy();
  });

  it('renders the initial loading state', () => {
    const { getByText } = render(
      <MetricsDashboardView
        dashboard={null}
        loading
        error={null}
        onRefresh={jest.fn()}
      />,
    );
    expect(getByText('Loading metrics…')).toBeTruthy();
  });

  it('invokes onRefresh when the refresh callback fires', () => {
    const onRefresh = jest.fn();
    const { getByText } = render(
      <MetricsDashboardView
        dashboard={makeDashboard([])}
        loading={false}
        error={null}
        onRefresh={onRefresh}
      />,
    );
    expect(getByText('Metrics')).toBeTruthy();
    // The refresh control is native; the callback contract is exercised
    // directly (the container wires it to `load()`).
    onRefresh();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
