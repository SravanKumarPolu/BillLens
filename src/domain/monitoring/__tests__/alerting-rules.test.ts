import { describe, expect, it } from '@jest/globals';

import {
  ALERT_RULES,
  evaluateAlertRule,
  evaluateAllAlerts,
  type AlertFiringContext,
} from '../alerting-rules';
import { METRIC_DEFINITIONS, MONITORED_METRICS } from '../metrics-model';

describe('alerting-rules', () => {
  describe('ALERT_RULES', () => {
    it('has exactly one rule per monitored metric (9 total)', () => {
      const ruleKeys = Object.keys(ALERT_RULES).sort();
      const metricKeys = [...MONITORED_METRICS].sort();
      expect(ruleKeys).toEqual(metricKeys);
      expect(ruleKeys.length).toBe(9);
    });

    it.each(MONITORED_METRICS)('rule for %s has matching metric + non-empty runbook', (key) => {
      const rule = ALERT_RULES[key];
      expect(rule).toBeDefined();
      expect(rule.metric).toBe(key);
      expect(rule.runbook.length).toBeGreaterThan(0);
      expect(rule.cooldownMs).toBeGreaterThan(0);
    });

    it('assigns critical severity to crash / settlement / restore failures', () => {
      expect(ALERT_RULES.crash_free_session_rate.severity).toBe('critical');
      expect(ALERT_RULES.settlement_completion_rate.severity).toBe('critical');
      expect(ALERT_RULES.restore_success_rate.severity).toBe('critical');
    });

    it('assigns warning severity to sync / OCR / export / backup', () => {
      expect(ALERT_RULES.sync_success_rate.severity).toBe('warning');
      expect(ALERT_RULES.ocr_accuracy_rate.severity).toBe('warning');
      expect(ALERT_RULES.export_success_rate.severity).toBe('warning');
      expect(ALERT_RULES.backup_success_rate.severity).toBe('warning');
    });

    it('assigns info severity to latency metrics', () => {
      expect(ALERT_RULES.api_latency_p95_ms.severity).toBe('info');
      expect(ALERT_RULES.database_query_latency_p95_ms.severity).toBe('info');
    });

    it('runbooks never mention PII patterns (no amounts, no merchant names, no file paths)', () => {
      const allRunbooks = Object.values(ALERT_RULES)
        .map((r) => r.runbook)
        .join(' ');
      // No exact amounts
      expect(allRunbooks).not.toMatch(/amount_minor\s*=\s*\d+/i);
      // No file paths
      expect(allRunbooks).not.toMatch(/\/(data|var|Users|home)\//);
      expect(allRunbooks).not.toMatch(/file:\/\//);
      // No SQL fragments
      expect(allRunbooks).not.toMatch(/\bSELECT\b/);
      expect(allRunbooks).not.toMatch(/\bINSERT\s+INTO\b/);
    });
  });

  describe('evaluateAlertRule — higher_is_better ratios', () => {
    const rule = ALERT_RULES.crash_free_session_rate; // threshold 0.98
    const definition = METRIC_DEFINITIONS.crash_free_session_rate;

    it('returns null when value is above threshold', () => {
      const ctx: AlertFiringContext = {
        observedValue: 0.995,
        evaluatedAt: '2025-01-01T00:00:00.000Z',
        lastFiredAt: null,
      };
      expect(evaluateAlertRule(rule, ctx)).toBe(null);
    });

    it('fires when value drops below threshold', () => {
      const ctx: AlertFiringContext = {
        observedValue: 0.95, // below 0.98
        evaluatedAt: '2025-01-01T00:00:00.000Z',
        lastFiredAt: null,
      };
      const fired = evaluateAlertRule(rule, ctx);
      expect(fired).not.toBeNull();
      expect(fired?.metric).toBe('crash_free_session_rate');
      expect(fired?.severity).toBe('critical');
      expect(fired?.observedValue).toBe(0.95);
      expect(fired?.threshold).toBe(definition.alertThreshold);
      expect(fired?.suppressed).toBe(false);
    });

    it('suppressed when cooldown has not elapsed', () => {
      const ctx: AlertFiringContext = {
        observedValue: 0.95,
        evaluatedAt: '2025-01-01T00:05:00.000Z', // 5 min after
        lastFiredAt: '2025-01-01T00:00:00.000Z', // cooldown is 15 min
      };
      const fired = evaluateAlertRule(rule, ctx);
      expect(fired).not.toBeNull();
      expect(fired?.suppressed).toBe(true);
    });

    it('fires again when cooldown has elapsed', () => {
      const ctx: AlertFiringContext = {
        observedValue: 0.95,
        evaluatedAt: '2025-01-01T00:20:00.000Z', // 20 min after
        lastFiredAt: '2025-01-01T00:00:00.000Z', // cooldown is 15 min
      };
      const fired = evaluateAlertRule(rule, ctx);
      expect(fired).not.toBeNull();
      expect(fired?.suppressed).toBe(false);
    });

    it('returns null when observed equals threshold exactly (>= passes for higher_is_better)', () => {
      const ctx: AlertFiringContext = {
        observedValue: definition.alertThreshold,
        evaluatedAt: '2025-01-01T00:00:00.000Z',
        lastFiredAt: null,
      };
      expect(evaluateAlertRule(rule, ctx)).toBe(null);
    });
  });

  describe('evaluateAlertRule — lower_is_better latencies', () => {
    const rule = ALERT_RULES.api_latency_p95_ms; // threshold 1500 ms
    const definition = METRIC_DEFINITIONS.api_latency_p95_ms;

    it('returns null when value is below threshold', () => {
      const ctx: AlertFiringContext = {
        observedValue: 400,
        evaluatedAt: '2025-01-01T00:00:00.000Z',
        lastFiredAt: null,
      };
      expect(evaluateAlertRule(rule, ctx)).toBe(null);
    });

    it('fires when value rises above threshold', () => {
      const ctx: AlertFiringContext = {
        observedValue: 2000,
        evaluatedAt: '2025-01-01T00:00:00.000Z',
        lastFiredAt: null,
      };
      const fired = evaluateAlertRule(rule, ctx);
      expect(fired).not.toBeNull();
      expect(fired?.severity).toBe('info');
      expect(fired?.observedValue).toBe(2000);
      expect(fired?.threshold).toBe(definition.alertThreshold);
      expect(fired?.suppressed).toBe(false);
    });

    it('suppressed when cooldown (5 min for latency) has not elapsed', () => {
      const ctx: AlertFiringContext = {
        observedValue: 2000,
        evaluatedAt: '2025-01-01T00:02:00.000Z', // 2 min after
        lastFiredAt: '2025-01-01T00:00:00.000Z',
      };
      const fired = evaluateAlertRule(rule, ctx);
      expect(fired).not.toBeNull();
      expect(fired?.suppressed).toBe(true);
    });
  });

  describe('evaluateAllAlerts', () => {
    it('returns only fired + non-suppressed alerts', () => {
      const observed = {
        crash_free_session_rate: 0.9, // fires (critical, 15-min cooldown)
        sync_success_rate: 0.9, // fires (warning, 15-min cooldown)
        api_latency_p95_ms: 2000, // fires (info, 5-min cooldown)
        ocr_accuracy_rate: 0.95, // does NOT fire (above 0.8)
      };
      const nowIso = '2025-01-01T01:00:00.000Z';
      const lastFired = {
        crash_free_session_rate: '2025-01-01T00:50:00.000Z', // 10 min ago, within 15-min cooldown → suppressed
        sync_success_rate: null, // fires
        api_latency_p95_ms: '2025-01-01T00:30:00.000Z', // 30 min ago, outside 5-min cooldown → fires
      };
      const fired = evaluateAllAlerts(observed, nowIso, lastFired);
      const metricKeys = fired.map((f) => f.metric).sort();
      expect(metricKeys).toEqual(['api_latency_p95_ms', 'sync_success_rate']);
    });

    it('returns empty array when no metrics are out of bounds', () => {
      const observed = {
        crash_free_session_rate: 1.0,
        sync_success_rate: 1.0,
      };
      const fired = evaluateAllAlerts(observed, '2025-01-01T00:00:00.000Z', {});
      expect(fired).toEqual([]);
    });

    it('skips metrics that have no observed value', () => {
      const fired = evaluateAllAlerts({}, '2025-01-01T00:00:00.000Z', {});
      expect(fired).toEqual([]);
    });
  });
});
