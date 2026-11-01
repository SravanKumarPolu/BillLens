/**
 * N+1 query detector.
 *
 * Detects N+1 query patterns in database access logs. An N+1 pattern is
 * when a single logical operation triggers N+1 SQL queries instead of a
 * single JOINed query — typically 1 query to fetch a list of N entities,
 * then N queries to fetch each entity's related data.
 *
 * Detection heuristics:
 *   - A burst of N similar queries within a short time window (e.g. 5+
 *     queries against the same table with similar shape, within 100ms).
 *   - Queries that follow a "list" query (e.g. SELECT * FROM expenses
 *     WHERE group_id = ?) followed by N queries against the same
 *     foreign-key column (e.g. SELECT * FROM splits WHERE expense_id = ?).
 *
 * Pure functions — no I/O, no globals.
 */

// ---------------------------------------------------------------------------
// Query log entry
// ---------------------------------------------------------------------------

export interface QueryLogEntry {
  /** ISO date-time when the query was executed. */
  readonly timestamp: string;
  /** The SQL query string (or a normalized representation). */
  readonly query: string;
  /** Approximate duration of the query in milliseconds. */
  readonly durationMs: number;
  /** The table the query targeted (extracted or normalized). */
  readonly table: string;
  /** The parameters bound to the query (optional, for pattern matching). */
  readonly parameters?: readonly unknown[];
}

// ---------------------------------------------------------------------------
// N+1 detection
// ---------------------------------------------------------------------------

export interface NPlusOneDetection {
  /** The table on which the N+1 pattern was detected. */
  readonly table: string;
  /** The pattern that triggered the detection. */
  readonly pattern: string;
  /** The number of repeated queries. */
  readonly repeatCount: number;
  /** The first query timestamp in the burst. */
  readonly firstQueryAt: string;
  /** The last query timestamp in the burst. */
  readonly lastQueryAt: string;
  /** Total duration of the burst in milliseconds. */
  readonly burstDurationMs: number;
}

export interface NPlusOneAnalysisResult {
  /** Total queries analyzed. */
  readonly totalQueries: number;
  /** Number of N+1 patterns detected. */
  readonly detectionCount: number;
  /** The detected N+1 patterns. */
  readonly detections: readonly NPlusOneDetection[];
  /** Whether ANY N+1 pattern was detected. */
  readonly hasNPlusOne: boolean;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface NPlusOneDetectorOptions {
  /**
   * Minimum number of repeated queries against the same table within the
   * time window to flag as N+1. Default: 5.
   */
  readonly minRepeatCount?: number;
  /**
   * Time window in milliseconds within which repeated queries count as
   * a burst. Default: 100.
   */
  readonly burstWindowMs?: number;
}

const DEFAULT_MIN_REPEAT_COUNT = 5;
const DEFAULT_BURST_WINDOW_MS = 100;

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Analyzes a list of query log entries for N+1 patterns.
 *
 * Returns a `NPlusOneAnalysisResult` listing all detected patterns.
 *
 * Pure function — does not mutate the input.
 */
export function detectNPlusOneQueries(
  queries: readonly QueryLogEntry[],
  options?: NPlusOneDetectorOptions,
): NPlusOneAnalysisResult {
  const minRepeatCount = options?.minRepeatCount ?? DEFAULT_MIN_REPEAT_COUNT;
  const burstWindowMs = options?.burstWindowMs ?? DEFAULT_BURST_WINDOW_MS;

  if (queries.length === 0) {
    return Object.freeze({
      totalQueries: 0,
      detectionCount: 0,
      detections: Object.freeze([]),
      hasNPlusOne: false,
    });
  }

  // Sort queries by timestamp (defensive — caller may not have sorted).
  const sorted = [...queries].sort((a, b) => {
    const ta = Date.parse(a.timestamp);
    const tb = Date.parse(b.timestamp);
    if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0;
    return ta - tb;
  });

  const detections: NPlusOneDetection[] = [];

  // Group queries by table.
  const byTable = new Map<string, QueryLogEntry[]>();
  for (const q of sorted) {
    const list = byTable.get(q.table) ?? [];
    list.push(q);
    byTable.set(q.table, list);
  }

  // For each table, scan for bursts of similar queries.
  for (const [table, entries] of byTable) {
    if (entries.length < minRepeatCount) continue;

    // Sliding window — find bursts of `minRepeatCount` queries within
    // `burstWindowMs` of each other.
    let burstStart = 0;
    for (let i = 0; i < entries.length; i++) {
      const current = entries[i]!;
      const currentTime = Date.parse(current.timestamp);
      if (!Number.isFinite(currentTime)) continue;

      // Shrink window until the burst fits within the time window.
      while (burstStart < i) {
        const startTime = Date.parse(entries[burstStart]!.timestamp);
        if (!Number.isFinite(startTime)) {
          burstStart++;
          continue;
        }
        if (currentTime - startTime <= burstWindowMs) break;
        burstStart++;
      }

      const startTimeStr = entries[burstStart]!.timestamp;
      const startTime = Date.parse(startTimeStr);
      if (!Number.isFinite(startTime)) continue;

      const burstSize = i - burstStart + 1;
      if (burstSize >= minRepeatCount) {
        // We have a burst. Check if the queries are similar (same shape).
        const burstQueries = entries.slice(burstStart, i + 1);
        if (queriesAreSimilar(burstQueries)) {
          detections.push({
            table,
            pattern: normalizeQueryPattern(burstQueries[0]!.query),
            repeatCount: burstSize,
            firstQueryAt: burstQueries[0]!.timestamp,
            lastQueryAt: burstQueries[burstQueries.length - 1]!.timestamp,
            burstDurationMs: currentTime - Date.parse(entries[burstStart]!.timestamp),
          });
          // Skip ahead to avoid duplicate detections of the same burst.
          burstStart = i + 1;
        }
      }
    }
  }

  return Object.freeze({
    totalQueries: queries.length,
    detectionCount: detections.length,
    detections: Object.freeze(detections),
    hasNPlusOne: detections.length > 0,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns `true` when all queries in the list have the same normalized
 * shape (same SQL with potentially different parameters).
 */
function queriesAreSimilar(queries: readonly QueryLogEntry[]): boolean {
  if (queries.length < 2) return true;
  const firstPattern = normalizeQueryPattern(queries[0]!.query);
  for (let i = 1; i < queries.length; i++) {
    if (normalizeQueryPattern(queries[i]!.query) !== firstPattern) {
      return false;
    }
  }
  return true;
}

/**
 * Normalizes a SQL query by replacing literal values with `?` placeholders.
 * This lets us detect that "SELECT * FROM expenses WHERE id = 1" and
 * "SELECT * FROM expenses WHERE id = 2" are the same pattern.
 */
export function normalizeQueryPattern(query: string): string {
  if (typeof query !== 'string' || query.length === 0) return '';
  let normalized = query.trim();
  // Replace string literals.
  normalized = normalized.replace(/'[^']*'/g, '?');
  // Replace numeric literals.
  normalized = normalized.replace(/\b\d+\b/g, '?');
  // Collapse whitespace.
  normalized = normalized.replace(/\s+/g, ' ');
  return normalized.toLowerCase();
}

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

/**
 * Returns a severity score for an N+1 detection: 0 = info, 1 = warning,
 * 2 = critical.
 *
 * Severity is based on `repeatCount`:
 *   - < 10: info (0)
 *   - 10-49: warning (1)
 *   - >= 50: critical (2)
 */
export function getDetectionSeverity(
  detection: NPlusOneDetection,
): 0 | 1 | 2 {
  if (detection.repeatCount >= 50) return 2;
  if (detection.repeatCount >= 10) return 1;
  return 0;
}

/**
 * Returns a human-readable severity label.
 */
export function getDetectionSeverityLabel(detection: NPlusOneDetection): string {
  const severity = getDetectionSeverity(detection);
  switch (severity) {
    case 0:
      return 'info';
    case 1:
      return 'warning';
    case 2:
      return 'critical';
  }
}
