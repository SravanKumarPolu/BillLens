import { describe, expect, it } from '@jest/globals';

import {
  detectNPlusOneQueries,
  getDetectionSeverity,
  getDetectionSeverityLabel,
  normalizeQueryPattern,
  type QueryLogEntry,
} from '../index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuery(
  table: string,
  query: string,
  timestamp: string,
  durationMs: number = 5,
): QueryLogEntry {
  return { timestamp, query, table, durationMs };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('n-plus-one-detector', () => {
  describe('normalizeQueryPattern', () => {
    it('replaces numeric literals with ?', () => {
      expect(normalizeQueryPattern('SELECT * FROM expenses WHERE id = 1')).toBe(
        'select * from expenses where id = ?',
      );
    });

    it('replaces string literals with ?', () => {
      expect(normalizeQueryPattern("SELECT * FROM users WHERE name = 'alice'")).toBe(
        'select * from users where name = ?',
      );
    });

    it('collapses whitespace', () => {
      expect(normalizeQueryPattern('SELECT    *\n  FROM\t expenses')).toBe(
        'select * from expenses',
      );
    });

    it('returns empty string for empty input', () => {
      expect(normalizeQueryPattern('')).toBe('');
    });

    it('lowercases the query', () => {
      expect(normalizeQueryPattern('SELECT * FROM EXPENSES')).toBe(
        'select * from expenses',
      );
    });

    it('normalizes two queries with different params to the same pattern', () => {
      const p1 = normalizeQueryPattern('SELECT * FROM expenses WHERE id = 1');
      const p2 = normalizeQueryPattern('SELECT * FROM expenses WHERE id = 2');
      expect(p1).toBe(p2);
    });
  });

  describe('detectNPlusOneQueries', () => {
    it('returns no detections for an empty list', () => {
      const result = detectNPlusOneQueries([]);
      expect(result.totalQueries).toBe(0);
      expect(result.detectionCount).toBe(0);
      expect(result.hasNPlusOne).toBe(false);
    });

    it('returns no detections for a single query', () => {
      const queries = [
        makeQuery('expenses', 'SELECT * FROM expenses WHERE id = 1', '2025-01-01T00:00:00.000Z'),
      ];
      const result = detectNPlusOneQueries(queries);
      expect(result.detectionCount).toBe(0);
    });

    it('detects a burst of 5+ similar queries against the same table', () => {
      const queries: QueryLogEntry[] = [];
      // 5 queries, each 10ms apart (total 40ms — fits within 100ms window).
      for (let i = 0; i < 5; i++) {
        queries.push(
          makeQuery(
            'splits',
            `SELECT * FROM splits WHERE expense_id = ${i}`,
            `2025-01-01T00:00:00.0${(i * 10).toString().padStart(2, '0')}Z`,
          ),
        );
      }
      const result = detectNPlusOneQueries(queries, { minRepeatCount: 5, burstWindowMs: 100 });
      expect(result.detectionCount).toBe(1);
      expect(result.hasNPlusOne).toBe(true);
      expect(result.detections[0]!.table).toBe('splits');
      expect(result.detections[0]!.repeatCount).toBe(5);
    });

    it('does NOT flag a single non-repeated query', () => {
      const queries = [
        makeQuery('expenses', 'SELECT * FROM expenses', '2025-01-01T00:00:00.000Z'),
        makeQuery('splits', 'SELECT * FROM splits', '2025-01-01T00:00:00.010Z'),
        makeQuery('groups', 'SELECT * FROM groups', '2025-01-01T00:00:00.020Z'),
      ];
      const result = detectNPlusOneQueries(queries);
      expect(result.detectionCount).toBe(0);
    });

    it('does NOT flag queries spread over a long time window', () => {
      const queries: QueryLogEntry[] = [];
      for (let i = 0; i < 10; i++) {
        queries.push(
          makeQuery(
            'splits',
            `SELECT * FROM splits WHERE expense_id = ${i}`,
            `2025-01-01T00:0${i}:00.000Z`, // each 1 minute apart
          ),
        );
      }
      const result = detectNPlusOneQueries(queries, { minRepeatCount: 5, burstWindowMs: 100 });
      // Spread over minutes, not ms — should NOT flag.
      expect(result.detectionCount).toBe(0);
    });

    it('flags queries that share the same shape but differ in params', () => {
      const queries: QueryLogEntry[] = [];
      // 10 queries, each 5ms apart (45ms total — fits within 1000ms window).
      for (let i = 0; i < 10; i++) {
        queries.push(
          makeQuery(
            'expenses',
            `SELECT * FROM expenses WHERE group_id = ${i}`,
            `2025-01-01T00:00:00.0${(i * 5).toString().padStart(2, '0')}Z`,
          ),
        );
      }
      const result = detectNPlusOneQueries(queries, { minRepeatCount: 5, burstWindowMs: 1000 });
      expect(result.detectionCount).toBeGreaterThan(0);
      expect(result.detections[0]!.repeatCount).toBeGreaterThanOrEqual(5);
    });

    it('does NOT flag queries with different shapes (even if against the same table)', () => {
      const queries: QueryLogEntry[] = [];
      for (let i = 0; i < 5; i++) {
        queries.push(
          makeQuery(
            'expenses',
            `SELECT col${i} FROM expenses WHERE id = ${i}`,
            `2025-01-01T00:00:00.0${i}0Z`,
          ),
        );
      }
      // Each query has a different shape (different column). Should NOT flag.
      const result = detectNPlusOneQueries(queries, { minRepeatCount: 5, burstWindowMs: 100 });
      expect(result.detectionCount).toBe(0);
    });

    it('respects minRepeatCount option', () => {
      const queries: QueryLogEntry[] = [];
      for (let i = 0; i < 3; i++) {
        queries.push(
          makeQuery(
            'splits',
            `SELECT * FROM splits WHERE expense_id = ${i}`,
            `2025-01-01T00:00:00.0${i}0Z`,
          ),
        );
      }
      // With minRepeatCount=5, 3 queries is not enough.
      const result = detectNPlusOneQueries(queries, { minRepeatCount: 5, burstWindowMs: 100 });
      expect(result.detectionCount).toBe(0);

      // With minRepeatCount=3, 3 queries IS enough.
      const result2 = detectNPlusOneQueries(queries, { minRepeatCount: 3, burstWindowMs: 100 });
      expect(result2.detectionCount).toBeGreaterThan(0);
    });

    it('respects burstWindowMs option', () => {
      // 5 queries, each 50ms apart — total 200ms.
      const ts = [
        '2025-01-01T00:00:00.000Z',
        '2025-01-01T00:00:00.050Z',
        '2025-01-01T00:00:00.100Z',
        '2025-01-01T00:00:00.150Z',
        '2025-01-01T00:00:00.200Z',
      ];
      const queries: QueryLogEntry[] = ts.map((t, i) =>
        makeQuery('splits', `SELECT * FROM splits WHERE expense_id = ${i}`, t),
      );

      // With burstWindowMs=100, only 3 queries fit (50ms apart, so 3 in 100ms).
      const result = detectNPlusOneQueries(queries, { minRepeatCount: 5, burstWindowMs: 100 });
      expect(result.detectionCount).toBe(0);

      // With burstWindowMs=300, all 5 fit (200ms total).
      const result2 = detectNPlusOneQueries(queries, { minRepeatCount: 5, burstWindowMs: 300 });
      expect(result2.detectionCount).toBeGreaterThan(0);
    });

    it('reports the first and last query timestamps in the burst', () => {
      const queries: QueryLogEntry[] = [];
      for (let i = 0; i < 5; i++) {
        queries.push(
          makeQuery(
            'splits',
            `SELECT * FROM splits WHERE expense_id = ${i}`,
            `2025-01-01T00:00:00.0${i}0Z`,
          ),
        );
      }
      const result = detectNPlusOneQueries(queries, { minRepeatCount: 5, burstWindowMs: 1000 });
      expect(result.detections[0]!.firstQueryAt).toBe(queries[0]!.timestamp);
      expect(result.detections[0]!.lastQueryAt).toBe(queries[4]!.timestamp);
    });

    it('reports total queries analyzed', () => {
      const queries = [
        makeQuery('expenses', 'SELECT * FROM expenses', '2025-01-01T00:00:00.000Z'),
        makeQuery('splits', 'SELECT * FROM splits', '2025-01-01T00:00:00.010Z'),
      ];
      const result = detectNPlusOneQueries(queries);
      expect(result.totalQueries).toBe(2);
    });

    it('returns a frozen result object', () => {
      const result = detectNPlusOneQueries([]);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.detections)).toBe(true);
    });

    it('handles queries from multiple tables independently', () => {
      const queries: QueryLogEntry[] = [];
      for (let i = 0; i < 5; i++) {
        queries.push(
          makeQuery(
            'splits',
            `SELECT * FROM splits WHERE expense_id = ${i}`,
            `2025-01-01T00:00:00.0${i}0Z`,
          ),
        );
      }
      for (let i = 0; i < 5; i++) {
        queries.push(
          makeQuery(
            'members',
            `SELECT * FROM members WHERE group_id = ${i}`,
            `2025-01-01T00:00:00.${i}00Z`,
          ),
        );
      }
      const result = detectNPlusOneQueries(queries, { minRepeatCount: 5, burstWindowMs: 1000 });
      expect(result.detectionCount).toBe(2);
    });
  });

  describe('getDetectionSeverity + getDetectionSeverityLabel', () => {
    it('returns info (0) for repeatCount < 10', () => {
      const detection = {
        table: 'splits',
        pattern: 'select * from splits where expense_id = ?',
        repeatCount: 5,
        firstQueryAt: '2025-01-01T00:00:00.000Z',
        lastQueryAt: '2025-01-01T00:00:00.100Z',
        burstDurationMs: 100,
      };
      expect(getDetectionSeverity(detection)).toBe(0);
      expect(getDetectionSeverityLabel(detection)).toBe('info');
    });

    it('returns warning (1) for repeatCount 10-49', () => {
      const detection = {
        table: 'splits',
        pattern: 'select * from splits where expense_id = ?',
        repeatCount: 20,
        firstQueryAt: '2025-01-01T00:00:00.000Z',
        lastQueryAt: '2025-01-01T00:00:00.100Z',
        burstDurationMs: 100,
      };
      expect(getDetectionSeverity(detection)).toBe(1);
      expect(getDetectionSeverityLabel(detection)).toBe('warning');
    });

    it('returns critical (2) for repeatCount >= 50', () => {
      const detection = {
        table: 'splits',
        pattern: 'select * from splits where expense_id = ?',
        repeatCount: 50,
        firstQueryAt: '2025-01-01T00:00:00.000Z',
        lastQueryAt: '2025-01-01T00:00:00.100Z',
        burstDurationMs: 100,
      };
      expect(getDetectionSeverity(detection)).toBe(2);
      expect(getDetectionSeverityLabel(detection)).toBe('critical');
    });

    it('returns critical (2) for very large repeatCount', () => {
      const detection = {
        table: 'splits',
        pattern: 'select * from splits where expense_id = ?',
        repeatCount: 500,
        firstQueryAt: '2025-01-01T00:00:00.000Z',
        lastQueryAt: '2025-01-01T00:00:00.100Z',
        burstDurationMs: 100,
      };
      expect(getDetectionSeverity(detection)).toBe(2);
      expect(getDetectionSeverityLabel(detection)).toBe('critical');
    });
  });
});
