/**
 * Infrastructure cost tracking — per-component cost snapshots + trends.
 *
 * Phase 10 Prompt 95: Business Intelligence.
 *
 * CRITICAL PRIVACY CONSTRAINTS:
 *   - Cost snapshots use AGGREGATED numbers only. No individual user data.
 *   - `costPerUser` and `costPerActiveUser` are derived averages — they
 *     do NOT leak individual usage patterns.
 *   - Cost data is sourced from cloud-provider billing APIs — it is
 *     inherently aggregated at the provider level.
 *
 * This module is PURE: it computes cost trends from inputs; no I/O.
 *
 * See `docs/business-intelligence.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CostSnapshot {
  /** Period identifier, e.g. '2026-07'. */
  readonly period: string;
  readonly supabaseCost: number;
  readonly ocrProviderCost: number;
  readonly storageCost: number;
  readonly pushNotificationCost: number;
  readonly cdnCost: number;
  readonly monitoringCost: number;
  readonly totalCost: number;
  readonly costPerUser: number;
  readonly costPerActiveUser: number;
}

export interface CostTrend {
  /** Absolute change in total cost (current - previous). */
  readonly costChange: number;
  /** Absolute change in cost-per-user (current - previous). */
  readonly costPerUserChange: number;
}

// ---------------------------------------------------------------------------
// Cost per user
// ---------------------------------------------------------------------------

/**
 * Computes the cost per user.
 *
 *   costPerUser = totalCost / totalUsers
 *
 * Returns 0 when `totalUsers` is 0.
 *
 * Throws on negative `totalCost` or `totalUsers`.
 */
export function computeCostPerUser(
  totalCost: number,
  totalUsers: number,
): number {
  if (!Number.isFinite(totalCost) || !Number.isFinite(totalUsers)) {
    throw new Error(
      `totalCost and totalUsers must be finite, got ${totalCost}, ${totalUsers}`,
    );
  }
  if (totalCost < 0) {
    throw new Error(`totalCost must be non-negative, got ${totalCost}`);
  }
  if (!Number.isInteger(totalUsers) || totalUsers < 0) {
    throw new Error(
      `totalUsers must be a non-negative integer, got ${totalUsers}`,
    );
  }
  if (totalUsers === 0) return 0;
  return totalCost / totalUsers;
}

/**
 * Computes the cost per ACTIVE user.
 *
 * Active user = a user who performed at least one billable action (OCR
 * scan, settlement confirmation, sync) in the period.
 */
export function computeCostPerActiveUser(
  totalCost: number,
  activeUsers: number,
): number {
  if (!Number.isFinite(totalCost) || !Number.isFinite(activeUsers)) {
    throw new Error(
      `totalCost and activeUsers must be finite, got ${totalCost}, ${activeUsers}`,
    );
  }
  if (totalCost < 0) {
    throw new Error(`totalCost must be non-negative, got ${totalCost}`);
  }
  if (!Number.isInteger(activeUsers) || activeUsers < 0) {
    throw new Error(
      `activeUsers must be a non-negative integer, got ${activeUsers}`,
    );
  }
  if (activeUsers === 0) return 0;
  return totalCost / activeUsers;
}

// ---------------------------------------------------------------------------
// Cost trend
// ---------------------------------------------------------------------------

/**
 * Computes the cost trend between two snapshots.
 *
 *   costChange = current.totalCost - previous.totalCost
 *   costPerUserChange = current.costPerUser - previous.costPerUser
 *
 * A positive `costChange` means costs went up. A positive
 * `costPerUserChange` means each user costs more to serve (concerning —
 * it indicates cost is growing faster than user base).
 */
export function computeCostTrend(
  current: CostSnapshot,
  previous: CostSnapshot,
): CostTrend {
  if (!current || typeof current.totalCost !== 'number') {
    throw new Error('current must be a CostSnapshot');
  }
  if (!previous || typeof previous.totalCost !== 'number') {
    throw new Error('previous must be a CostSnapshot');
  }
  return Object.freeze({
    costChange: current.totalCost - previous.totalCost,
    costPerUserChange: current.costPerUser - previous.costPerUser,
  });
}

// ---------------------------------------------------------------------------
// Snapshot construction
// ---------------------------------------------------------------------------

export interface CostSnapshotInput {
  readonly period: string;
  readonly supabaseCost: number;
  readonly ocrProviderCost: number;
  readonly storageCost: number;
  readonly pushNotificationCost: number;
  readonly cdnCost: number;
  readonly monitoringCost: number;
  readonly totalUsers: number;
  readonly activeUsers: number;
}

/**
 * Constructs a `CostSnapshot` from raw inputs. Computes `totalCost`,
 * `costPerUser`, and `costPerActiveUser` automatically.
 *
 * Each component cost MUST be non-negative. The function throws on a
 * negative component cost (which would indicate a credit or refund —
 * those should be tracked separately, not folded into the snapshot).
 */
export function createCostSnapshot(input: CostSnapshotInput): CostSnapshot {
  if (typeof input.period !== 'string' || input.period.length === 0) {
    throw new Error('period must be a non-empty string');
  }
  const components: readonly { name: string; value: number }[] = [
    { name: 'supabaseCost', value: input.supabaseCost },
    { name: 'ocrProviderCost', value: input.ocrProviderCost },
    { name: 'storageCost', value: input.storageCost },
    { name: 'pushNotificationCost', value: input.pushNotificationCost },
    { name: 'cdnCost', value: input.cdnCost },
    { name: 'monitoringCost', value: input.monitoringCost },
  ];
  for (const c of components) {
    if (!Number.isFinite(c.value)) {
      throw new Error(`${c.name} must be finite, got ${c.value}`);
    }
    if (c.value < 0) {
      throw new Error(`${c.name} must be non-negative, got ${c.value}`);
    }
  }
  const totalCost = components.reduce((sum, c) => sum + c.value, 0);
  const costPerUser = computeCostPerUser(totalCost, input.totalUsers);
  const costPerActiveUser = computeCostPerActiveUser(totalCost, input.activeUsers);
  return Object.freeze({
    period: input.period,
    supabaseCost: input.supabaseCost,
    ocrProviderCost: input.ocrProviderCost,
    storageCost: input.storageCost,
    pushNotificationCost: input.pushNotificationCost,
    cdnCost: input.cdnCost,
    monitoringCost: input.monitoringCost,
    totalCost,
    costPerUser,
    costPerActiveUser,
  });
}

/**
 * Returns the largest cost component in a snapshot.
 *
 * Useful for the "Where is our money going?" dashboard widget.
 */
export function getLargestCostComponent(
  snapshot: CostSnapshot,
): { name: string; cost: number } {
  const components: readonly { name: string; cost: number }[] = [
    { name: 'supabase', cost: snapshot.supabaseCost },
    { name: 'ocr_provider', cost: snapshot.ocrProviderCost },
    { name: 'storage', cost: snapshot.storageCost },
    { name: 'push_notification', cost: snapshot.pushNotificationCost },
    { name: 'cdn', cost: snapshot.cdnCost },
    { name: 'monitoring', cost: snapshot.monitoringCost },
  ];
  let largest = components[0];
  for (const c of components) {
    if (largest === undefined || c.cost > largest.cost) {
      largest = c;
    }
  }
  if (largest === undefined) {
    throw new Error('no cost components found');
  }
  return { name: largest.name, cost: largest.cost };
}
