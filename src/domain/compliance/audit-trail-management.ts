/**
 * Audit trail management — security-relevant event log + retention.
 *
 * Phase 10 Prompt 97: Compliance and Governance.
 *
 * The audit trail captures security-relevant events: data access,
 * configuration changes, permission grants/revokes, policy updates,
 * backup validations, incident response actions, and vendor reviews.
 *
 * This module is PURE: it filters and partitions an existing event
 * list. The actual event store (Postgres, append-only log, SIEM) is
 * the application layer's responsibility.
 *
 * Retention policy: events older than `retentionDays` are returned in
 * the `purge` partition. The application layer is responsible for the
 * actual purge (typically via a scheduled job that exports to cold
 * storage before deletion).
 *
 * See `docs/compliance-governance.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditEventType =
  | 'data_access'
  | 'config_change'
  | 'permission_grant'
  | 'permission_revoke'
  | 'policy_update'
  | 'backup_validation'
  | 'incident_response'
  | 'vendor_review';

export type AuditEventResult = 'success' | 'failure' | 'denied';

export interface AuditEvent {
  /** Stable unique identifier. */
  readonly id: string;
  /** Event type. */
  readonly type: AuditEventType;
  /** User ID of the actor performing the action. */
  readonly actorId: string;
  /** Resource type (e.g. 'group', 'expense', 'api_key'). */
  readonly resourceType: string;
  /** Resource identifier. */
  readonly resourceId: string;
  /** Action performed (e.g. 'read', 'update', 'create', 'delete'). */
  readonly action: string;
  /** ISO date when the event occurred. */
  readonly timestamp: string;
  /** Source IP address of the actor. */
  readonly ipAddress: string;
  /** Result of the action. */
  readonly result: AuditEventResult;
  /** Additional structured metadata (optional, must not contain PII). */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AuditFilter {
  /** Filter by event type. */
  readonly type?: AuditEventType;
  /** Filter by actor ID. */
  readonly actorId?: string;
  /** Only events at or after this ISO date. */
  readonly from?: string;
  /** Only events at or before this ISO date. */
  readonly to?: string;
  /** Filter by resource type. */
  readonly resourceType?: string;
  /** Filter by result. */
  readonly result?: AuditEventResult;
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/**
 * Filters the event list by the provided filter object.
 *
 * All filter fields are optional. When a field is omitted, no filter
 * is applied for that dimension. When multiple fields are set, ALL
 * must match (logical AND).
 *
 * The `from` and `to` dates are inclusive (>= from and <= to).
 *
 * The returned list preserves the original order of the input list
 * (no re-sorting). The caller is responsible for sorting by timestamp
 * if needed.
 */
export function filterAuditEvents(
  events: readonly AuditEvent[],
  filters: AuditFilter,
): readonly AuditEvent[] {
  const fromMs =
    filters.from !== undefined ? parseStrict(filters.from) : null;
  const toMs = filters.to !== undefined ? parseStrict(filters.to) : null;

  return events.filter((e) => {
    if (filters.type !== undefined && e.type !== filters.type) {
      return false;
    }
    if (filters.actorId !== undefined && e.actorId !== filters.actorId) {
      return false;
    }
    if (
      filters.resourceType !== undefined &&
      e.resourceType !== filters.resourceType
    ) {
      return false;
    }
    if (filters.result !== undefined && e.result !== filters.result) {
      return false;
    }
    if (fromMs !== null || toMs !== null) {
      const tsMs = parseStrict(e.timestamp);
      if (tsMs === null) {
        return false; // malformed timestamp → exclude
      }
      if (fromMs !== null && tsMs < fromMs) {
        return false;
      }
      if (toMs !== null && tsMs > toMs) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Partitions events into `retain` and `purge` based on retention policy.
 *
 * Events whose `timestamp` is older than `retentionDays` from `now`
 * are placed in `purge`. All others are placed in `retain`.
 *
 * Events with unparseable timestamps are placed in `retain` (fail
 * safe — never purge an event we can't date, because it might be
 * required for an ongoing investigation).
 *
 * Returns a frozen object with two readonly arrays.
 */
export function computeAuditRetention(
  events: readonly AuditEvent[],
  retentionDays: number,
  now: string,
): { retain: readonly AuditEvent[]; purge: readonly AuditEvent[] } {
  const nowMs = parseStrict(now);
  if (nowMs === null || !Number.isFinite(retentionDays) || retentionDays <= 0) {
    // Bad input — retain everything (fail safe).
    return Object.freeze({
      retain: events.slice(),
      purge: Object.freeze([]),
    });
  }
  const msPerDay = 24 * 60 * 60 * 1000;
  const cutoff = nowMs - retentionDays * msPerDay;

  const retain: AuditEvent[] = [];
  const purge: AuditEvent[] = [];
  for (const e of events) {
    const tsMs = parseStrict(e.timestamp);
    if (tsMs === null) {
      retain.push(e);
      continue;
    }
    if (tsMs < cutoff) {
      purge.push(e);
    } else {
      retain.push(e);
    }
  }
  return Object.freeze({
    retain: Object.freeze(retain),
    purge: Object.freeze(purge),
  });
}

/**
 * Returns a count of events grouped by type. Useful for audit dashboards.
 */
export function getEventTypeCounts(
  events: readonly AuditEvent[],
): Readonly<Record<AuditEventType, number>> {
  const counts: Record<AuditEventType, number> = {
    data_access: 0,
    config_change: 0,
    permission_grant: 0,
    permission_revoke: 0,
    policy_update: 0,
    backup_validation: 0,
    incident_response: 0,
    vendor_review: 0,
  };
  for (const e of events) {
    counts[e.type] += 1;
  }
  return Object.freeze(counts);
}

/**
 * Returns a count of events grouped by result. Useful for audit dashboards
 * (e.g. "12 denied actions in the last 24h — investigate").
 */
export function getEventResultCounts(
  events: readonly AuditEvent[],
): Readonly<Record<AuditEventResult, number>> {
  const counts: Record<AuditEventResult, number> = {
    success: 0,
    failure: 0,
    denied: 0,
  };
  for (const e of events) {
    counts[e.result] += 1;
  }
  return Object.freeze(counts);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseStrict(iso: string): number | null {
  if (typeof iso !== 'string' || iso.trim() === '') {
    return null;
  }
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}
