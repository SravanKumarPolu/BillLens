/**
 * DeleteLocalGroupCopyUseCase — "remove this group from my device".
 *
 * This is deliberately NOT a shared deletion. It refuses in every
 * situation where deleting the local copy could destroy or contradict
 * financial records:
 *
 *   - cloud sync configured → a pull would restore the group, and the
 *     cloud copy is the shared record; use "Leave group" instead;
 *   - any outstanding balance;
 *   - any settlement awaiting confirmation;
 *   - any queued local change (it may be the only copy).
 *
 * The purge is hard-delete + cascade, never a tombstone, so no sync
 * operation is enqueued. Every successful deletion is written to the
 * audit log (who, when, which group) without financial values.
 */

import type { LocalGroupPurgePort } from '@application/retention/local-group-purge.port';
import type { GetGroupBalancesUseCase } from '@application/balances';
import type { ListPendingConfirmationsUseCase } from '@application/settlements';
import { InvalidEntityError } from '@domain/errors';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { GroupRepository } from '@domain/repositories/group.repository';
import { nowDateTime } from '@domain/value-objects';

export interface DeleteLocalGroupCopyInput {
  readonly groupId: string;
  readonly actorId: string;
  /** True when Supabase is configured; local purge is then unsafe. */
  readonly cloudSyncEnabled: boolean;
}

export interface DeleteLocalGroupCopyOutput {
  readonly groupId: string;
  readonly purgedAt: string;
}

export class DeleteLocalGroupCopyUseCase {
  constructor(
    private readonly groups: GroupRepository,
    private readonly balances: GetGroupBalancesUseCase,
    private readonly pendingConfirmations: ListPendingConfirmationsUseCase,
    private readonly purge: LocalGroupPurgePort,
    private readonly audit: AuditRepository,
    private readonly generateId: () => string,
  ) {}

  async execute(input: DeleteLocalGroupCopyInput): Promise<DeleteLocalGroupCopyOutput> {
    const group = await this.groups.findById(input.groupId as never);
    if (group === null || group.deletedAt !== undefined) {
      throw new InvalidEntityError(`Group ${input.groupId} not found on this device.`);
    }

    if (input.cloudSyncEnabled) {
      throw new InvalidEntityError(
        'This group is linked to cloud sync. Use “Leave group” instead — deleting the local copy would be restored by the next sync.',
      );
    }

    const balanceResult = await this.balances.execute({ groupId: input.groupId as never });
    const hasOutstanding =
      !balanceResult.notFound &&
      balanceResult.results.some((currency) =>
        currency.memberCurrencyBalances.some((balance) => balance.netBalanceMinor !== 0),
      );
    if (hasOutstanding) {
      throw new InvalidEntityError(
        'This group still has unsettled balances. Settle up before deleting the local copy.',
      );
    }

    const pending = await this.pendingConfirmations.execute({
      groupId: input.groupId as never,
      pagination: { limit: 1 },
    });
    if (pending.items.length > 0) {
      throw new InvalidEntityError(
        'A settlement is awaiting confirmation. Resolve it before deleting the local copy.',
      );
    }

    // No sync-queue check here: this path is only reachable when cloud
    // sync is NOT configured (the guard above), so queued operations can
    // never drain and must not block a local-only user forever.

    await this.purge.purgeLocalGroup(input.groupId);

    const purgedAt = nowDateTime();
    await this.audit.append({
      id: this.generateId(),
      entityType: 'group_local_copy',
      entityId: input.groupId,
      action: 'delete',
      actorId: input.actorId as never,
      changeSummary: { scope: 'local_only', groupName: group.name },
    });

    return { groupId: input.groupId, purgedAt };
  }
}
