/**
 * Approval workflow — role-based, threshold-driven expense approvals.
 *
 * Phase 10 Prompt 92: Enterprise Features.
 *
 * CRITICAL FINANCIAL SAFETY: approvals are a GATE, not a mutation.
 * If an expense requires approval, the application layer MUST NOT
 * persist the expense in a 'confirmed' state. The split-engine
 * continues to enforce zero-sum + payer-total invariants regardless
 * of approval status.
 *
 * See `docs/enterprise-features.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'escalated'
  | 'expired';

export interface ApprovalRequest {
  readonly id: string;
  readonly expenseId: string;
  readonly approverId: string;
  readonly status: ApprovalStatus;
  readonly requestedAt: string;
  readonly decidedAt?: string;
  readonly reason?: string;
}

export interface ApprovalChainConfig {
  readonly orgId: string;
  readonly departmentId: string;
  /**
   * Thresholds + approver IDs, ordered from lowest to highest amount.
   * The chain returns all approvers whose threshold is <= amount.
   */
  readonly levels: readonly {
    readonly approverId: string;
    readonly thresholdMinor: number;
  }[];
  /** Optional final approver for any amount above all levels. */
  readonly finalApproverId?: string;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when an expense of the given amount requires approval
 * (amount exceeds the configured threshold).
 *
 * `threshold` is in minor units. A threshold of 0 means all expenses
 * require approval. A negative threshold is treated as 0.
 */
export function shouldRequireApproval(
  amountMinor: number,
  threshold: number,
): boolean {
  if (!Number.isFinite(amountMinor) || !Number.isFinite(threshold)) {
    return false;
  }
  if (amountMinor < 0) {
    return false;
  }
  const safeThreshold = threshold < 0 ? 0 : threshold;
  return amountMinor > safeThreshold;
}

/**
 * Returns the approval chain for a given org + department + amount.
 *
 * The chain is ordered from the lowest-threshold approver to the
 * highest, including all approvers whose threshold is <= amount. If
 * `finalApproverId` is configured and amount exceeds all level
 * thresholds, the final approver is appended.
 *
 * Returns an empty array when no approvers are configured.
 */
export function getApprovalChain(
  config: ApprovalChainConfig,
  amountMinor: number,
): readonly string[] {
  const chain: string[] = [];
  const sortedLevels = [...config.levels].sort(
    (a, b) => a.thresholdMinor - b.thresholdMinor,
  );
  for (const level of sortedLevels) {
    if (amountMinor > level.thresholdMinor) {
      if (!chain.includes(level.approverId)) {
        chain.push(level.approverId);
      }
    }
  }
  if (
    config.finalApproverId &&
    (sortedLevels.length === 0 ||
      amountMinor > sortedLevels[sortedLevels.length - 1]!.thresholdMinor)
  ) {
    if (!chain.includes(config.finalApproverId)) {
      chain.push(config.finalApproverId);
    }
  }
  return chain;
}

/**
 * Returns the next approver in the chain (the first one whose status
 * is 'pending' or 'escalated'). Returns null when no further approval
 * is required.
 */
export function getNextApprover(
  chain: readonly string[],
  requests: readonly ApprovalRequest[],
): string | null {
  const decided = new Set(
    requests.filter((r) => r.status === 'approved' || r.status === 'rejected')
      .map((r) => r.approverId),
  );
  for (const approverId of chain) {
    if (!decided.has(approverId)) {
      return approverId;
    }
  }
  return null;
}

/**
 * Returns true when the entire chain has approved (no pending or
 * rejected requests, and every chain member has an approved request).
 */
export function isFullyApproved(
  chain: readonly string[],
  requests: readonly ApprovalRequest[],
): boolean {
  if (chain.length === 0) {
    return true;
  }
  const approved = new Set(
    requests.filter((r) => r.status === 'approved').map((r) => r.approverId),
  );
  return chain.every((id) => approved.has(id));
}

/**
 * Returns true when any request in the chain was rejected.
 */
export function isRejected(
  _chain: readonly string[],
  requests: readonly ApprovalRequest[],
): boolean {
  return requests.some((r) => r.status === 'rejected');
}

/**
 * Computes the SLA expiry timestamp for an approval request.
 *
 * Default SLA is 7 days from the request timestamp.
 */
export function computeApprovalExpiry(
  requestedAt: string,
  slaDays = 7,
): string {
  const t = Date.parse(requestedAt);
  if (!Number.isFinite(t)) {
    return requestedAt;
  }
  return new Date(t + slaDays * 86_400_000).toISOString();
}
