import {
  createAccountDeletionRequest,
  DEFAULT_ACCOUNT_DELETION_RECOVERY_DAYS,
  type AccountDeletionRequest,
  type AccountDeletionRequestId,
} from '@domain/entities/account-deletion-request';
import { asGuestIdentityId } from '@domain/entities/guest-identity';
import { InvalidEntityError } from '@domain/errors';
import type { AuthenticationProvider } from '@domain/ports/authentication-provider.port';
import type { SecureStorage } from '@domain/ports/secure-storage.port';
import { SECURE_STORAGE_KEYS } from '@domain/ports/secure-storage.port';
import type { SessionStoragePort } from '@domain/ports/session-storage.port';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { GuestIdentityRepository } from '@domain/repositories/guest-identity.repository';
import type { DateTime } from '@domain/value-objects';
import { nowDateTime } from '@domain/value-objects';
import type { UserId } from '@shared-types/index';

import type { AccountDeletionRepository, LocalDataWiper } from './account-deletion.port';

const asUserId = (id: string): UserId => id as UserId;

/**
 * RequestAccountDeletionUseCase — Phase 8 Prompt 77 (store readiness).
 *
 * Apple (App Review Guideline 5.1.1(v)) and Google Play (Account
 * Deletion policy) both require a working in-app account deletion
 * flow. This use case implements it with the two behavioural halves:
 *
 * ── Authenticated user ─────────────────────────────────────────────
 *   1. Requires explicit confirmation (`confirmed === true`) — a
 *      destructive action must never fire on an accidental tap.
 *   2. Records a *scheduled* deletion with a recovery window
 *      (default 14 days — see docs/legal/account-deletion-policy.md).
 *   3. Signs the user out and clears the stored session, so sessions
 *      are revoked on this device immediately (Apple requirement:
 *      "revocation of sessions").
 *   4. Local data is PRESERVED during the recovery window so the user
 *      can cancel; cloud deletion completes server-side after the
 *      deadline.
 *   5. Writes an audit entry (id-only — no tokens, no financial data).
 *
 * ── Guest ──────────────────────────────────────────────────────────
 * Guests have no cloud account. Deletion is a permanent *local* wipe:
 *   1. Same explicit-confirmation requirement.
 *   2. Wipes all local data through the LocalDataWiper port.
 *   3. Clears the guest identity row + SecureStore entries.
 *   4. Writes an audit entry BEFORE the wipe (the audit store itself is
 *      then wiped — the entry exists for crash-diagnostic ordering).
 *
 * PRIVACY: nothing here logs OTPs, tokens, invite tokens or financial
 * content (Phase 8 Prompt 71 global rule 8).
 */

export interface RequestAccountDeletionInput {
  /**
   * Explicit user confirmation. The UI must collect this from a
   * two-step confirmation (consequence screen + final dialog).
   */
  readonly confirmed: boolean;
  /** Recovery window override (days). Clamped by the domain factory. */
  readonly recoveryDays?: number;
  /** Injectable clock for tests. Defaults to real now. */
  readonly now?: DateTime;
}

export type RequestAccountDeletionOutput =
  | {
      readonly outcome: 'scheduled';
      readonly request: AccountDeletionRequest;
      readonly localDataWiped: false;
    }
  | {
      readonly outcome: 'completed_immediately';
      readonly wipedStores: readonly string[];
      readonly localDataWiped: true;
    };

export class RequestAccountDeletionUseCase {
  constructor(
    private readonly authProvider: AuthenticationProvider,
    private readonly sessionStorage: SessionStoragePort,
    private readonly deletionRepo: AccountDeletionRepository,
    private readonly localWiper: LocalDataWiper,
    private readonly guestRepo: GuestIdentityRepository,
    private readonly secureStorage: SecureStorage,
    private readonly auditRepo: AuditRepository,
    private readonly generateIdFn: () => string,
  ) {}

  async execute(input: RequestAccountDeletionInput): Promise<RequestAccountDeletionOutput> {
    // 1. Explicit confirmation is mandatory for any destructive action.
    if (input.confirmed !== true) {
      throw new InvalidEntityError(
        'Account deletion requires explicit confirmation (confirmed=true).',
      );
    }

    const now: DateTime = input.now ?? nowDateTime();
    const session = await this.authProvider.getSession();

    if (session) {
      return this.executeForAuthenticatedUser(session.userId, input, now);
    }
    return this.executeForGuest();
  }

  private async executeForAuthenticatedUser(
    userId: UserId,
    input: RequestAccountDeletionInput,
    now: DateTime,
  ): Promise<RequestAccountDeletionOutput> {
    // 2. One active deletion request per user.
    const existing = await this.deletionRepo.findActiveByUser(userId);
    if (existing && existing.status === 'scheduled') {
      throw new InvalidEntityError(
        'An account deletion is already scheduled. Cancel it before requesting again.',
      );
    }

    // 3. Schedule with recovery window (recoveryDeadline computed by domain).
    const request = createAccountDeletionRequest({
      id: this.generateIdFn() as AccountDeletionRequestId,
      userId,
      requestedAt: now,
      recoveryDays: input.recoveryDays ?? DEFAULT_ACCOUNT_DELETION_RECOVERY_DAYS,
    });
    await this.deletionRepo.save(request);

    // 4. Revoke sessions: sign out provider-side, clear stored session.
    await this.authProvider.signOut();
    await this.sessionStorage.clearSession();

    // 5. Audit (no tokens, no financial content).
    await this.auditRepo.append({
      id: this.generateIdFn(),
      entityType: 'account_deletion_request',
      entityId: request.id as string,
      action: 'create',
      actorId: userId,
      changeSummary: {
        status: 'scheduled',
        recoveryDeadlineAt: request.recoveryDeadlineAt,
        // Deliberately excludes: email, tokens, balances, receipts.
      },
    });

    return { outcome: 'scheduled', request, localDataWiped: false };
  }

  private async executeForGuest(): Promise<RequestAccountDeletionOutput> {
    // Guests have no cloud account — deletion is a local wipe.
    const guestId = await this.secureStorage.get(
      SECURE_STORAGE_KEYS.currentGuestIdentityId,
    );

    // Audit before the wipe (audit store itself is wiped afterwards).
    await this.auditRepo.append({
      id: this.generateIdFn(),
      entityType: 'guest_identity',
      entityId: guestId ?? 'unknown',
      action: 'delete',
      changeSummary: { status: 'guest_local_wipe' },
      newVersion: 1,
    });

    // Soft-delete the guest identity row (defensive if id is present).
    if (guestId) {
      const identity = await this.guestRepo.findById(
        asGuestIdentityId(guestId),
      );
      if (identity) {
        await this.guestRepo.softDelete(identity.id, {
          actorId: identity.linkedUserId ?? asUserId(identity.id as string),
          reason: 'guest_local_wipe',
          deletedAt: nowDateTime(),
        });
      }
    }

    // Wipe all local data (SQLite rows, files, SecureStore).
    const { wipedStores } = await this.localWiper.wipeAllLocalData();

    return { outcome: 'completed_immediately', wipedStores, localDataWiped: true };
  }
}
