import type { UserId } from '@shared-types/index';

import { VersionConflictError } from '../errors/index';
import {
  type DateTime,
  type DisplayName,
  type EmailAddress,
  type VersionNumber,
  asDateTime,
  asDisplayName,
  asEmailAddress,
  asVersionNumber,
  initialVersionNumber,
  nowDateTime,
} from '../value-objects/index';


export function asUserId(value: string): UserId {
  return value as UserId;
}

/**
 * A registered BillLens user with a cloud account.
 *
 * Distinct from `GuestIdentity` (which represents an unregistered local
 * user). A `User` may be linked to one or more `GuestIdentity` records
 * (one per device they upgraded from).
 */
export interface User {
  readonly id: UserId;
  readonly displayName: DisplayName;
  readonly email: EmailAddress;
  readonly avatarUrl?: string;
  readonly createdAt: DateTime;
  readonly updatedAt: DateTime;
  readonly deletedAt?: DateTime;
  readonly version: VersionNumber;
}

export interface UserCreateInput {
  readonly id: UserId;
  readonly displayName: string;
  readonly email: string;
  readonly avatarUrl?: string;
  readonly now?: DateTime;
}

export function createUser(input: UserCreateInput): User {
  const now = input.now ?? nowDateTime();
  return {
    id: input.id,
    displayName: asDisplayName(input.displayName),
    email: asEmailAddress(input.email),
    ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
    createdAt: asDateTime(now),
    updatedAt: asDateTime(now),
    version: initialVersionNumber(),
  };
}

export interface UserUpdateInput {
  readonly displayName?: string;
  readonly avatarUrl?: string;
  readonly now?: DateTime;
  readonly expectedVersion: VersionNumber;
}

export function updateUser(current: User, input: UserUpdateInput): User {
  if (current.version !== input.expectedVersion) {
    throw new VersionConflictError(
      `User version conflict: expected ${input.expectedVersion}, got ${current.version}`,
      input.expectedVersion as number,
      current.version as number,
    );
  }
  const now = input.now ?? nowDateTime();
  return {
    ...current,
    ...(input.displayName !== undefined ? { displayName: asDisplayName(input.displayName) } : {}),
    ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
    updatedAt: asDateTime(now),
    version: asVersionNumber(current.version + 1),
  };
}

export interface UserSoftDeleteInput {
  readonly now?: DateTime;
  readonly expectedVersion: VersionNumber;
}

export function softDeleteUser(current: User, input: UserSoftDeleteInput): User {
  if (current.version !== input.expectedVersion) {
    throw new VersionConflictError(
      `User version conflict: expected ${input.expectedVersion}, got ${current.version}`,
      input.expectedVersion as number,
      current.version as number,
    );
  }
  if (current.deletedAt) {
    throw new Error(`User ${current.id} is already deleted`);
  }
  const now = input.now ?? nowDateTime();
  return {
    ...current,
    deletedAt: asDateTime(now),
    updatedAt: asDateTime(now),
    version: asVersionNumber(current.version + 1),
  };
}

export function isUserActive(user: User): boolean {
  return user.deletedAt === undefined;
}
