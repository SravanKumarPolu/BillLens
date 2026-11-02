import type { GuestIdentity } from '@domain/entities/guest-identity';
import { InvalidEntityError } from '@domain/errors';
import type { AuditRepository } from '@domain/repositories/audit.repository';
import type { GuestIdentityRepository } from '@domain/repositories/guest-identity.repository';
import {
  asDisplayName,
  asDateTime,
  asVersionNumber,
  nextVersionNumber,
  nowDateTime,
} from '@domain/value-objects';
import type { GuestIdentityId } from '@shared-types/index';

/**
 * UpdateGuestDisplayNameUseCase — change a guest identity's display name.
 *
 * Validates the new name (1–80 chars after trim), persists the updated
 * identity to SQLite, and writes an audit entry capturing the version
 * transition.
 *
 * The previous display name is NOT recorded in the audit changeSummary —
 * display names are user-controlled PII and the audit log is append-only
 * (we do not want old names lingering forever).
 */

export interface UpdateGuestDisplayNameInput {
  readonly guestIdentityId: GuestIdentityId;
  readonly displayName: string;
  /** Optional expected version for optimistic concurrency. */
  readonly expectedVersion?: number;
}

export class UpdateGuestDisplayNameUseCase {
  constructor(
    private readonly guestRepo: GuestIdentityRepository,
    private readonly auditRepo: AuditRepository,
    private readonly generateIdFn: () => string,
  ) {}

  async execute(input: UpdateGuestDisplayNameInput): Promise<GuestIdentity> {
    // 1. Validate the new display name (throws on empty / too long).
    const displayName = asDisplayName(input.displayName);

    // 2. Load the current identity.
    const current = await this.guestRepo.findById(input.guestIdentityId);
    if (!current) {
      throw new InvalidEntityError(
        `Guest identity ${input.guestIdentityId} not found`,
      );
    }

    // 3. Optimistic concurrency check (if expectedVersion provided).
    if (input.expectedVersion !== undefined) {
      if ((current.version as number) !== input.expectedVersion) {
        throw new InvalidEntityError(
          `GuestIdentity version conflict: expected ${input.expectedVersion}, got ${current.version as number}`,
        );
      }
    }

    // 4. Apply the update.
    const now = nowDateTime();
    const updated: GuestIdentity = {
      ...current,
      displayName,
      updatedAt: asDateTime(now),
      version: asVersionNumber(nextVersionNumber(current.version) as number),
    };

    await this.guestRepo.save(updated);

    // 5. Audit.
    await this.auditRepo.append({
      id: this.generateIdFn(),
      entityType: 'guest_identity',
      entityId: updated.id as string,
      action: 'update',
      actorId: undefined,
      previousVersion: current.version as number,
      newVersion: updated.version as number,
      changeSummary: { field: 'displayName' },
    });

    return updated;
  }
}
