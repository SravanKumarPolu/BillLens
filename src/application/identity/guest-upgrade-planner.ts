
import type { Expense } from '@domain/entities/expense';
import type { ExpensePayer } from '@domain/entities/expense-payer';
import type { ExpenseSplit } from '@domain/entities/expense-split';
import type { Group } from '@domain/entities/group';
import type { GroupMember } from '@domain/entities/group-member';
import type { GuestIdentity } from '@domain/entities/guest-identity';
import type { Receipt } from '@domain/entities/receipt';
import type { ReceiptPrivacyPreference } from '@domain/entities/receipt';
import type { ReceiptItem } from '@domain/entities/receipt-item';
import {
  requiresCloudUpload,
  shouldDeleteImageAfterExtraction,
} from '@domain/entities/receipt-privacy-preference';
import type { Settlement } from '@domain/entities/settlement';
import {
  DeletedEntityError,
  InvalidEntityError,
  VersionConflictError,
} from '@domain/errors/index';
import type { DateTime } from '@domain/value-objects/date-time';
import type { GuestIdentityId, UserId } from '@shared-types/index';

/**
 * Guest → Cloud upgrade planner.
 *
 * Pure domain service that produces a migration plan for upgrading a
 * guest identity to a cloud account. The plan lists every local entity
 * that needs to be uploaded, every group whose membership needs to be
 * reconciled, and any duplicate memberships that need resolution.
 *
 * The plan is RESUMABLE — if the upgrade is interrupted, calling
 * `planUpgrade` again produces the same plan (idempotent), and the
 * upgrade executor can skip entities that have already been uploaded.
 */

/**
 * Per-receipt migration entry, derived from each receipt's
 * {@link ReceiptPrivacyPreference}. The upgrade executor consults this
 * plan to decide what to upload for each receipt.
 */
export interface ReceiptMigrationEntry {
  readonly receiptId: string;
  readonly privacyPreference: ReceiptPrivacyPreference;
  readonly shouldUploadImage: boolean;
  readonly shouldUploadStructuredData: boolean;
  readonly reason: string;
}

export interface GuestUpgradePlan {
  readonly guestIdentityId: GuestIdentityId;
  readonly targetUserId: UserId;
  /** Local groups created by the guest that need to be uploaded. */
  readonly groupsToUpload: readonly Group[];
  /** Local expenses that need to be uploaded. */
  readonly expensesToUpload: readonly Expense[];
  /** Local expense payers that need to be uploaded (filtered to active expenses). */
  readonly payersToUpload: readonly ExpensePayer[];
  /** Local expense splits that need to be uploaded (filtered to active expenses). */
  readonly splitsToUpload: readonly ExpenseSplit[];
  /** Local settlements that need to be uploaded. */
  readonly settlementsToUpload: readonly Settlement[];
  /** Local receipts that need to be uploaded. */
  readonly receiptsToUpload: readonly Receipt[];
  /** Local receipt items that need to be uploaded (filtered to active receipts). */
  readonly receiptItemsToUpload: readonly ReceiptItem[];
  /**
   * Privacy-aware receipt migration plan. One entry per active receipt,
   * describing whether the source image and/or structured data should be
   * uploaded, plus a human-readable reason.
   */
  readonly receiptMigrationPlan: readonly ReceiptMigrationEntry[];
  /**
   * Group memberships that need reconciliation. The guest's local member
   * record has `userId = undefined`; after upgrade, the cloud member
   * record should have `userId = targetUserId`.
   */
  readonly membershipsToReconcile: readonly GroupMember[];
  /**
   * Duplicate memberships detected — the guest's local member ID
   * conflicts with an existing cloud member for the same user+group.
   * Resolution strategy: keep the cloud member, remap local expenses/
   * settlements to reference the cloud member ID, then soft-delete the
   * local member.
   */
  readonly duplicateMemberships: readonly {
    readonly localMember: GroupMember;
    readonly cloudMember: GroupMember;
    readonly affectedExpenseIds: readonly string[];
    readonly affectedSettlementIds: readonly string[];
  }[];
  /** True if the plan is safe to execute without user review. */
  readonly requiresUserReview: boolean;
}

export interface GuestUpgradePlanInput {
  readonly guestIdentity: GuestIdentity;
  readonly targetUserId: UserId;
  readonly localGroups: readonly Group[];
  readonly localExpenses: readonly Expense[];
  readonly localPayers: readonly ExpensePayer[];
  readonly localSplits: readonly ExpenseSplit[];
  readonly localSettlements: readonly Settlement[];
  readonly localReceipts: readonly Receipt[];
  readonly localReceiptItems: readonly ReceiptItem[];
  readonly localMemberships: readonly GroupMember[];
  /** Existing cloud memberships for the target user (to detect duplicates). */
  readonly cloudMemberships: readonly GroupMember[];
}

/**
 * Produce an upgrade plan for a guest identity.
 *
 * @throws `DeletedEntityError` if the guest identity has already been
 *   upgraded (status = 'upgraded').
 * @throws `InvalidEntityError` if the guest identity's status is not
 *   `local_only` or `upgrade_pending` or `upgrade_failed`.
 */
export function planGuestUpgrade(input: GuestUpgradePlanInput): GuestUpgradePlan {
  const { guestIdentity, targetUserId } = input;

  // Validate guest identity is in an upgradable state.
  if (guestIdentity.upgradeStatus === 'upgraded') {
    throw new DeletedEntityError(
      `Guest identity ${guestIdentity.id} is already upgraded`,
      'GuestIdentity',
      guestIdentity.id as string,
    );
  }
  if (
    guestIdentity.upgradeStatus !== 'local_only' &&
    guestIdentity.upgradeStatus !== 'upgrade_pending' &&
    guestIdentity.upgradeStatus !== 'upgrade_failed'
  ) {
    throw new InvalidEntityError(
      `Guest identity ${guestIdentity.id} is in status ${guestIdentity.upgradeStatus} — cannot plan upgrade`,
    );
  }

  // Filter to active (non-deleted) entities.
  const activeGroups = input.localGroups.filter((g) => g.deletedAt === undefined);
  const activeExpenses = input.localExpenses.filter((e) => e.deletedAt === undefined);
  const activeSettlements = input.localSettlements.filter((s) => s.deletedAt === undefined);
  const activeReceipts = input.localReceipts.filter((r) => r.deletedAt === undefined);
  const activeMemberships = input.localMemberships.filter((m) => m.leftAt === undefined);

  // Filter payers/splits to only those belonging to active expenses.
  const activeExpenseIds = new Set(activeExpenses.map((e) => e.id as string));
  const filteredPayers = input.localPayers.filter((p) => activeExpenseIds.has(p.expenseId as string));
  const filteredSplits = input.localSplits.filter((s) => activeExpenseIds.has(s.expenseId as string));

  // Filter receipt items to only those belonging to active receipts.
  const activeReceiptIds = new Set(activeReceipts.map((r) => r.id as string));
  const filteredReceiptItems = input.localReceiptItems.filter((ri) =>
    activeReceiptIds.has(ri.receiptId as string),
  );

  // Build the privacy-aware receipt migration plan. Structured data
  // (merchant, totals, line items) ALWAYS syncs — only the image bytes
  // are gated by the receipt's storageMode.
  const receiptMigrationPlan: ReceiptMigrationEntry[] = activeReceipts.map((r) => {
    const pref = r.privacy;
    const shouldUpload = requiresCloudUpload(pref);
    const shouldDeleteImage = shouldDeleteImageAfterExtraction(pref);
    return {
      receiptId: r.id as string,
      privacyPreference: pref,
      shouldUploadImage: shouldUpload && !shouldDeleteImage,
      shouldUploadStructuredData: true, // structured data always syncs
      reason: shouldDeleteImage
        ? 'Image deleted after extraction; only structured data will sync'
        : shouldUpload
          ? 'Image and structured data will sync'
          : 'Local-only receipt; only structured data will sync',
    };
  });

  // Detect duplicate memberships: local member + cloud member exist for
  // the same group + target user.
  const duplicateMemberships: {
    readonly localMember: GroupMember;
    readonly cloudMember: GroupMember;
    readonly affectedExpenseIds: readonly string[];
    readonly affectedSettlementIds: readonly string[];
  }[] = [];
  for (const localMember of activeMemberships) {
    for (const cloudMember of input.cloudMemberships) {
      if (
        cloudMember.groupId === localMember.groupId &&
        cloudMember.userId === targetUserId &&
        cloudMember.leftAt === undefined
      ) {
        // Duplicate detected. Find affected expenses/settlements.
        // An expense is affected if any of its payers or splits
        // reference the local member ID.
        const affectedExpenseIds = activeExpenses
          .filter(
            (e) =>
              e.groupId === localMember.groupId &&
              (filteredPayers.some((p) => p.memberId === localMember.id && p.expenseId === e.id) ||
                filteredSplits.some((s) => s.memberId === localMember.id && s.expenseId === e.id)),
          )
          .map((e) => e.id as string);
        const affectedSettlementIds = activeSettlements
          .filter(
            (s) =>
              s.fromMemberId === localMember.id ||
              s.toMemberId === localMember.id,
          )
          .map((s) => s.id as string);
        duplicateMemberships.push({
          localMember,
          cloudMember,
          affectedExpenseIds,
          affectedSettlementIds,
        });
      }
    }
  }

  // Determine if user review is required.
  const requiresUserReview =
    duplicateMemberships.length > 0 ||
    guestIdentity.upgradeStatus === 'upgrade_failed';

  return {
    guestIdentityId: guestIdentity.id,
    targetUserId,
    groupsToUpload: activeGroups,
    expensesToUpload: activeExpenses,
    payersToUpload: filteredPayers,
    splitsToUpload: filteredSplits,
    settlementsToUpload: activeSettlements,
    receiptsToUpload: activeReceipts,
    receiptItemsToUpload: filteredReceiptItems,
    receiptMigrationPlan,
    membershipsToReconcile: activeMemberships,
    duplicateMemberships,
    requiresUserReview,
  };
}

/**
 * Result of executing an upgrade step. The upgrade executor processes
 * the plan one step at a time, recording progress so the upgrade can
 * resume after an interruption.
 */
export type UpgradeStepType =
  | 'upload_groups'
  | 'upload_expenses'
  | 'upload_payers'
  | 'upload_splits'
  | 'upload_settlements'
  | 'upload_receipts'
  | 'upload_receipt_items'
  | 'reconcile_memberships'
  | 'resolve_duplicates'
  | 'finalize';

export interface UpgradeStepResult {
  readonly stepType: UpgradeStepType;
  readonly success: boolean;
  readonly processedCount: number;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly completedAt: DateTime;
}

/**
 * Validate that an upgrade plan is still valid (i.e. the local state
 * hasn't changed since the plan was produced). Used by the executor
 * before each step to detect race conditions.
 */
export function validatePlanStillValid(
  plan: GuestUpgradePlan,
  currentGuestIdentity: GuestIdentity,
  expectedVersion: number,
): void {
  if (currentGuestIdentity.version !== expectedVersion) {
    throw new VersionConflictError(
      `Guest identity version changed: expected ${expectedVersion}, got ${currentGuestIdentity.version}`,
      expectedVersion,
      currentGuestIdentity.version as number,
    );
  }
  if (currentGuestIdentity.id !== plan.guestIdentityId) {
    throw new InvalidEntityError(
      `Guest identity ID mismatch: plan is for ${plan.guestIdentityId}, but current is ${currentGuestIdentity.id}`,
    );
  }
}
