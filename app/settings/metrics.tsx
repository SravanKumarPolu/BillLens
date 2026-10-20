/**
 * /settings/metrics — the on-device operational-metrics dashboard
 * (Prompt 81 presentation layer).
 *
 * Operator/diagnostics facing: reached from Settings → "App health".
 * Deep link: billlens://settings/metrics
 */

import { MetricsDashboardScreen } from '@presentation/screens/monitoring/MetricsDashboardScreen';

export default function MetricsDashboardRoute(): JSX.Element {
  return <MetricsDashboardScreen />;
}
