/**
 * Home dashboard DTO — application-layer projection from domain entities
 * to a presentation-friendly shape.
 *
 * The presentation layer's `createHomeDashboardViewModel` consumes the
 * raw input shape (`HomeDashboardInput`). This DTO is what the
 * application layer produces from domain entities (Group, Expense,
 * BalanceResult, draft counts, sync queue depth) BEFORE handing the data
 * to the presentation layer.
 *
 * The mapping is PURE — no business logic, no I/O, no React. It just
 * reshapes domain entities into the input contract the presentation
 * view-model expects. Keeping this mapping in the application layer
 * means the presentation layer never has to import domain entities or
 * know about their internal structure.
 *
 * Hard rule: this DTO NEVER fabricates financial data. If the source
 * data is empty (no groups, no expenses, no drafts), the DTO produced
 * will reflect that — it produces a legitimate empty-state input that
 * the presentation view-model can render as an empty state.
 */

import type { Group } from '@domain/entities/group';
import type { MemberBalance } from '@domain/services/balances/balance-engine';
import type { CurrencyCode } from '@domain/value-objects/currency-code';

// ---------------------------------------------------------------------------
// DTO types — mirror the presentation `HomeDashboardInput` shape, but
// redeclared here so the application layer does NOT depend on the
// presentation layer. The presentation layer accepts these DTOs as input
// because their shapes are structurally identical.
// ---------------------------------------------------------------------------

/** A single currency balance entry. `amountMinor` may be negative. */
export interface CurrencyBalanceEntryDTO {
  readonly currencyCode: string;
  readonly amountMinor: number;
}

/** Pre-formatted recent-group card the dashboard renders. */
export interface GroupCardDTO {
  readonly id: string;
  readonly name: string;
  readonly memberCount: number;
  /** Negative = user owes the group; positive = group owes the user. */
  readonly userBalanceMinor: number;
  readonly currencyCode: string;
  /** Pre-formatted relative label, e.g. "2 days ago". */
  readonly lastActivityLabel: string;
}

/** A pending action card on the dashboard (drafts awaiting review, etc.). */
export interface PendingActionDTO {
  readonly id: string;
  readonly kind:
    | 'receipt-waiting-for-review'
    | 'failed-sync-operation'
    | 'low-confidence-draft-field'
    | 'duplicate-warning';
  readonly title: string;
  readonly description: string;
  /** Route the card navigates to when tapped. */
  readonly targetRoute: string;
}

/** Input shape consumed by `createHomeDashboardViewModel`. */
export interface HomeDashboardDTO {
  readonly displayName: string;
  readonly balances: readonly CurrencyBalanceEntryDTO[];
  readonly recentGroups: readonly GroupCardDTO[];
  readonly pendingActions: readonly PendingActionDTO[];
  readonly hasPendingDrafts: boolean;
  readonly pendingDraftCount: number;
  readonly hasFailedSync: boolean;
  readonly failedSyncCount: number;
  readonly hourOfDay?: number;
}

// ---------------------------------------------------------------------------
// Mapping input — what the application use case passes in.
// ---------------------------------------------------------------------------

/** A recent group plus the current user's signed balance within it. */
export interface RecentGroupWithBalance {
  readonly group: Group;
  readonly memberCount: number;
  /**
   * The current user's signed balance within this group, in minor units.
   * Positive = group owes the user; negative = user owes the group.
   * Zero when the user is settled up.
   */
  readonly userNetBalanceMinor: number;
  /** Pre-formatted relative-activity label (e.g. "2 days ago"). */
  readonly lastActivityLabel: string;
}

/**
 * Application-layer input shape. The use case gathers all of this from
 * repositories / services and hands it to `mapHomeDashboard` to produce
 * the DTO consumed by the presentation layer.
 */
export interface HomeDashboardMappingInput {
  readonly displayName: string;
  /**
   * Net balance per currency across all the user's groups. Positive =
   * user is owed; negative = user owes. Already aggregated by the use
   * case (this DTO does not re-aggregate).
   */
  readonly balancesByCurrency: ReadonlyMap<CurrencyCode, number>;
  /** Recent groups with the user's per-group balance, most recent first. */
  readonly recentGroups: readonly RecentGroupWithBalance[];
  /** Pending action cards to show. */
  readonly pendingActions: readonly PendingActionDTO[];
  /** Number of expense drafts awaiting review (across all groups). */
  readonly pendingDraftCount: number;
  /** Number of queued sync operations that have permanently failed. */
  readonly failedSyncCount: number;
  /** Optional hour-of-day override (0–23) for deterministic tests. */
  readonly hourOfDay?: number;
}

// ---------------------------------------------------------------------------
// Pure mapping function
// ---------------------------------------------------------------------------

/**
 * Map domain entities + computed balances into a `HomeDashboardDTO`.
 *
 * Pure: no I/O, no React, no side effects. The presentation layer's
 * `createHomeDashboardViewModel` consumes the resulting DTO directly.
 *
 *   - Empty `recentGroups` → empty `recentGroups` array (legitimate
 *     empty state, no fabricated data).
 *   - Empty `balancesByCurrency` → empty `balances` array → the
 *     presentation view-model's `isAllSettledUp` flag becomes true.
 *   - Zero `pendingDraftCount` / `failedSyncCount` → falsey booleans,
 *     presentation view-model renders no pending-action header.
 */
export function mapHomeDashboard(input: HomeDashboardMappingInput): HomeDashboardDTO {
  const balances: CurrencyBalanceEntryDTO[] = [];
  for (const [currency, amountMinor] of input.balancesByCurrency) {
    balances.push({
      currencyCode: currency as string,
      amountMinor,
    });
  }

  const recentGroups: GroupCardDTO[] = input.recentGroups.map((entry) => ({
    id: entry.group.id as string,
    name: entry.group.name,
    memberCount: entry.memberCount,
    userBalanceMinor: entry.userNetBalanceMinor,
    currencyCode: entry.group.currencyCode as string,
    lastActivityLabel: entry.lastActivityLabel,
  }));

  const pendingDraftCount = Math.max(0, input.pendingDraftCount);
  const failedSyncCount = Math.max(0, input.failedSyncCount);

  return {
    displayName: input.displayName,
    balances,
    recentGroups,
    pendingActions: input.pendingActions,
    hasPendingDrafts: pendingDraftCount > 0,
    pendingDraftCount,
    hasFailedSync: failedSyncCount > 0,
    failedSyncCount,
    ...(input.hourOfDay !== undefined ? { hourOfDay: input.hourOfDay } : {}),
  };
}

/**
 * Aggregate per-group member balances into a per-currency net balance
 * map for the current user.
 *
 * Pure helper used by the use case BEFORE calling `mapHomeDashboard`.
 * Lives here (in the application layer) so the per-currency aggregation
 * rule is owned by the same layer that owns the DTO mapping.
 *
 *   - For each group, look up the current user's `MemberBalance.netBalanceMinor`.
 *   - Add it to the running total for that group's currency.
 *
 * The resulting map has one entry per currency the user has any balance in.
 */
export function aggregateBalancesByCurrency(
  perGroupBalances: readonly {
    readonly currencyCode: CurrencyCode;
    readonly userBalance: MemberBalance | undefined;
  }[],
): Map<CurrencyCode, number> {
  const out = new Map<CurrencyCode, number>();
  for (const entry of perGroupBalances) {
    const net = entry.userBalance?.netBalanceMinor ?? 0;
    const existing = out.get(entry.currencyCode) ?? 0;
    out.set(entry.currencyCode, existing + net);
  }
  return out;
}

/**
 * Build a list of pending-action cards from the current application state.
 *
 * Pure helper. Returns an empty array when there are no drafts awaiting
 * review, no failed syncs, and no other actionable items — the dashboard
 * then renders no pending-actions header.
 *
 * `draftTargetRoute` should be a function that turns a draft id into a
 * route the dashboard card can navigate to (e.g. `/drafts/<id>`).
 */
export function buildPendingActions(input: {
  readonly pendingDraftIds: readonly string[];
  readonly failedSyncIds: readonly string[];
  readonly draftTargetRoute: (draftId: string) => string;
  readonly failedSyncTargetRoute: () => string;
}): readonly PendingActionDTO[] {
  const actions: PendingActionDTO[] = [];

  if (input.pendingDraftIds.length > 0) {
    const firstDraftId = input.pendingDraftIds[0];
    if (firstDraftId) {
      actions.push({
        id: `draft-${firstDraftId}`,
        kind: 'receipt-waiting-for-review',
        title: 'Receipt waiting for review',
        description: `You have ${input.pendingDraftIds.length} draft${
          input.pendingDraftIds.length === 1 ? '' : 's'
        } to review.`,
        targetRoute: input.draftTargetRoute(firstDraftId),
      });
    }
  }

  if (input.failedSyncIds.length > 0) {
    actions.push({
      id: `failed-sync-${input.failedSyncIds.length}`,
      kind: 'failed-sync-operation',
      title: 'Sync failed',
      description: `${input.failedSyncIds.length} change${
        input.failedSyncIds.length === 1 ? '' : 's'
      } could not be synced. Tap to retry.`,
      targetRoute: input.failedSyncTargetRoute(),
    });
  }

  return actions;
}

/**
 * Format a "last activity" relative-time label from an ISO date string.
 *
 * Pure helper — no `Date.now()` access here (the caller passes the
 * current time, so the function is fully deterministic and testable).
 *
 * Returns one of:
 *   - "Just now"      — within the last minute
 *   - "N min ago"     — within the last hour
 *   - "N hr ago"      — within the last 24 hours
 *   - "N days ago"    — older than 24 hours
 *   - "—"             — `lastActivityAt` is undefined (no activity yet)
 */
export function formatLastActivityLabel(
  lastActivityAt: string | undefined,
  now: string,
): string {
  if (lastActivityAt === undefined) return '—';
  const lastMs = Date.parse(lastActivityAt);
  const nowMs = Date.parse(now);
  if (Number.isNaN(lastMs) || Number.isNaN(nowMs)) return '—';
  const diffMs = Math.max(0, nowMs - lastMs);
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
}
