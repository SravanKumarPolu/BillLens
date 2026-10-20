import {
  cancelAccountDeletion,
  isRecoveryWindowOpen,
  type AccountDeletionRequest,
} from '@domain/entities/account-deletion-request';
import { InvalidEntityError } from '@domain/errors';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { DateTime } from '@domain/value-objects';
import { nowDateTime } from '@domain/value-objects';
import type { UserId } from '@shared-types/index';

import type { AccountDeletionRepository } from './account-deletion.port';

/**
 * CancelAccountDeletionUseCase — Phase 8 Prompt 77.
 *
 * Lets a user reverse an account-deletion request during the recovery
 * window ("Recovery period" requirement). After cancellation:
 *   - The request is marked `cancelled` (kept for audit history).
 *   - The user's cloud account is preserved.
 *   - The user signs in again through the normal auth flow (sessions
 *     were revoked when the deletion was requested).
 *
 * After the recovery deadline this use case throws — cancellation is
 * no longer possible and the server-side deletion job takes over.
 */

export interface CancelAccountDeletionInput {
  readonly userId: UserId;
  readonly now?: DateTime;
}

export interface CancelAccountDeletionOutput {
  readonly request: AccountDeletionRequest;
}

export class CancelAccountDeletionUseCase {
  constructor(
    private readonly deletionRepo: AccountDeletionRepository,
    private readonly auditRepo: AuditRepository,
    private readonly generateIdFn: () => string,
  ) {}

  async execute(input: CancelAccountDeletionInput): Promise<CancelAccountDeletionOutput> {
    const now: DateTime = input.now ?? nowDateTime();

    const request = await this.deletionRepo.findActiveByUser(input.userId);
    if (!request) {
      throw new InvalidEntityError('No account deletion request found for this user.');
    }

    // Domain guard throws when the window is closed (keeps the
    // invariant next to the entity).
    const cancelled = cancelAccountDeletion(request, now);
    await this.deletionRepo.save(cancelled);

    await this.auditRepo.append({
      id: this.generateIdFn(),
      entityType: 'account_deletion_request',
      entityId: cancelled.id as string,
      action: 'update',
      actorId: input.userId,
      changeSummary: { status: 'cancelled', cancelledAt: now },
    });

    return { request: cancelled };
  }
}

/**
 * GetAccountDeletionStatusUseCase — Phase 8 Prompt 77.
 *
 * Read model for the Settings / DeleteAccount screens: reports whether
 * a deletion is scheduled, whether it can still be cancelled, and the
 * recovery deadline for display.
 */
export interface GetAccountDeletionStatusInput {
  readonly userId: UserId;
  readonly now?: DateTime;
}

export interface GetAccountDeletionStatusOutput {
  readonly hasScheduledDeletion: boolean;
  readonly canCancel: boolean;
  readonly recoveryDeadlineAt?: string;
  readonly requestedAt?: string;
}

export class GetAccountDeletionStatusUseCase {
  constructor(private readonly deletionRepo: AccountDeletionRepository) {}

  async execute(
    input: GetAccountDeletionStatusInput,
  ): Promise<GetAccountDeletionStatusOutput> {
    const now: DateTime = input.now ?? nowDateTime();
    const request = await this.deletionRepo.findActiveByUser(input.userId);

    if (!request || request.status !== 'scheduled') {
      return { hasScheduledDeletion: false, canCancel: false };
    }

    return {
      hasScheduledDeletion: true,
      canCancel: isRecoveryWindowOpen(request, now),
      recoveryDeadlineAt: request.recoveryDeadlineAt,
      requestedAt: request.requestedAt,
    };
  }
}
