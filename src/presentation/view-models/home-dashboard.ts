/**
 * Home dashboard view model.
 *
 * Pure projection from raw data into a shape the `HomeDashboardScreen`
 * consumes. The screen reads ONLY from this view model — never from
 * domain entities directly — so the screen stays thin and the layout
 * rules (greeting, balance summary, pending actions, recent groups)
 * are unit-testable without rendering React components.
 *
 * Financial data flows in as raw balances per currency (positive = the
 * user is owed, negative = the user owes). The view model groups them
 * by currency so multi-currency situations are never silently summed
 * into a meaningless aggregate.
 *
 * For Phase 2 the input is empty / zero everywhere, which produces a
 * legitimate empty-state view model — no fake financial data ever
 * appears in production paths.
 */

/** A single currency balance entry. `amountMinor` may be negative. */
export interface CurrencyBalanceEntry {
  readonly currencyCode: string;
  readonly amountMinor: number;
}

/** View model for a single recent-group card. */
export interface GroupCardViewModel {
  readonly id: string;
  readonly name: string;
  readonly memberCount: number;
  /** Negative = the user owes the group; positive = group owes the user. */
  readonly userBalanceMinor: number;
  readonly currencyCode: string;
  /** Pre-formatted relative label, e.g. "2 days ago". */
  readonly lastActivityLabel: string;
}

/** View model for a single pending-action card on the dashboard. */
export interface PendingActionViewModel {
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

/** Raw input shape passed to `createHomeDashboardViewModel`. */
export interface HomeDashboardInput {
  /** Display name to greet the user with (already trimmed). */
  readonly displayName: string;
  /** All net balances across groups, expressed per currency. */
  readonly balances: readonly CurrencyBalanceEntry[];
  /**
   * True when balance data could not be fully loaded (a group's
   * balance query failed, or the whole load errored). While true, an
   * empty `balances` list means UNAVAILABLE — not "all settled up"
   * (Phase 4: zero vs unavailable).
   */
  readonly balancesUnavailable: boolean;
  /** Number of groups whose dashboard queries partially failed. */
  readonly degradedGroupCount: number;
  /** Recent groups, most recent first. Already filtered / capped upstream. */
  readonly recentGroups: readonly GroupCardViewModel[];
  /** Pending action cards to show (empty array = no pending actions). */
  readonly pendingActions: readonly PendingActionViewModel[];
  /** True if there are expense drafts awaiting review. */
  readonly hasPendingDrafts: boolean;
  /** Number of drafts awaiting review (0 when none). */
  readonly pendingDraftCount: number;
  /** True if any queued mutation has permanently failed to sync. */
  readonly hasFailedSync: boolean;
  /** Number of changes that failed to sync (0 when none). */
  readonly failedSyncCount: number;
  /** Hour of the day (0–23) used to pick the greeting. Defaults to current hour. */
  readonly hourOfDay?: number;
}

/** The full view model consumed by `HomeDashboardScreen`. */
export interface HomeDashboardViewModel {
  /** Greeting prefix, e.g. "Good morning". */
  readonly greeting: string;
  /** Display name to render after the greeting. */
  readonly displayName: string;
  /** Currencies in which the user is owed money (positive balances only). */
  readonly owedByCurrency: readonly CurrencyBalanceEntry[];
  /** Currencies in which the user owes money (negative balances only, absolute values). */
  readonly owedToCurrency: readonly CurrencyBalanceEntry[];
  /** True when the user neither owes nor is owed across every currency. */
  readonly isAllSettledUp: boolean;
  /**
   * True when balance data could NOT be fully loaded — the balance
   * summary must show "unavailable" instead of "all settled up".
   * Takes precedence over `isAllSettledUp` (Phase 4).
   */
  readonly balancesUnavailable: boolean;
  /** Human-readable warning when some groups' data failed to load. */
  readonly degradedWarning: string | null;
  /** Pending action cards (empty array when none). */
  readonly pendingActions: readonly PendingActionViewModel[];
  /** True when at least one pending action card should be shown. */
  readonly hasPendingActions: boolean;
  /** Recent-group cards (empty array when none). */
  readonly recentGroups: readonly GroupCardViewModel[];
  /** True when there are no recent groups at all (triggers empty state). */
  readonly hasNoGroups: boolean;
  readonly hasPendingDrafts: boolean;
  readonly pendingDraftCount: number;
  readonly hasFailedSync: boolean;
  readonly failedSyncCount: number;
}

/**
 * Pick a time-of-day greeting for the given hour (0–23).
 *
 *   0  – 11  → "Good morning"
 *   12 – 17  → "Good afternoon"
 *   18 – 23  → "Good evening"
 */
export function greetingForHour(hour: number): string {
  const safe = Math.max(0, Math.min(23, Math.floor(hour)));
  if (safe < 12) return 'Good morning';
  if (safe < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Build the home dashboard view model from raw input.
 *
 * Pure function — no I/O, no React, no stores. The screen wires the
 * store values into the input and renders the resulting view model.
 */
export function createHomeDashboardViewModel(input: HomeDashboardInput): HomeDashboardViewModel {
  const hour =
    input.hourOfDay ??
    (typeof Date !== 'undefined' ? new Date().getHours() : 12);

  const owedByCurrency = input.balances
    .filter((b) => b.amountMinor > 0)
    .map((b) => ({ currencyCode: b.currencyCode, amountMinor: b.amountMinor }));

  const owedToCurrency = input.balances
    .filter((b) => b.amountMinor < 0)
    .map((b) => ({ currencyCode: b.currencyCode, amountMinor: Math.abs(b.amountMinor) }));

  const isAllSettledUp = owedByCurrency.length === 0 && owedToCurrency.length === 0;

  const degradedWarning =
    input.degradedGroupCount > 0
      ? input.degradedGroupCount === 1
        ? '1 group’s data could not be fully loaded.'
        : `${input.degradedGroupCount} groups’ data could not be fully loaded.`
      : null;

  return {
    greeting: greetingForHour(hour),
    displayName: input.displayName,
    owedByCurrency,
    owedToCurrency,
    isAllSettledUp,
    balancesUnavailable: input.balancesUnavailable,
    degradedWarning,
    pendingActions: input.pendingActions,
    hasPendingActions: input.pendingActions.length > 0,
    recentGroups: input.recentGroups,
    hasNoGroups: input.recentGroups.length === 0,
    hasPendingDrafts: input.hasPendingDrafts,
    pendingDraftCount: Math.max(0, input.pendingDraftCount),
    hasFailedSync: input.hasFailedSync,
    failedSyncCount: Math.max(0, input.failedSyncCount),
  };
}
