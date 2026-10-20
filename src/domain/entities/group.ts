import type { GroupId, UserId } from '@shared-types/index';

import { EmptyValueError, ValueTooLongError, VersionConflictError } from '../errors/index';
import {
  type CurrencyCode,
  type DateTime,
  type VersionNumber,
  asCurrencyCode,
  asDateTime,
  asVersionNumber,
  initialVersionNumber,
  nowDateTime,
} from '../value-objects/index';


export function asGroupId(value: string): GroupId {
  return value as GroupId;
}

export const GROUP_NAME_MAX_LENGTH = 100;
export const GROUP_DESCRIPTION_MAX_LENGTH = 500;

export interface Group {
  readonly id: GroupId;
  readonly name: string;
  readonly description?: string;
  readonly currencyCode: CurrencyCode;
  readonly createdBy: UserId;
  readonly createdAt: DateTime;
  readonly updatedAt: DateTime;
  readonly deletedAt?: DateTime;
  readonly version: VersionNumber;
}

export interface GroupCreateInput {
  readonly id: GroupId;
  readonly name: string;
  readonly description?: string;
  readonly currencyCode: string;
  readonly createdBy: UserId;
  readonly now?: DateTime;
}

export function createGroup(input: GroupCreateInput): Group {
  validateGroupName(input.name);
  if (input.description !== undefined) {
    validateGroupDescription(input.description);
  }
  const now = input.now ?? nowDateTime();
  return {
    id: input.id,
    name: input.name.trim(),
    ...(input.description !== undefined ? { description: input.description.trim() } : {}),
    currencyCode: asCurrencyCode(input.currencyCode),
    createdBy: input.createdBy,
    createdAt: asDateTime(now),
    updatedAt: asDateTime(now),
    version: initialVersionNumber(),
  };
}

export interface GroupUpdateInput {
  readonly name?: string;
  readonly description?: string;
  readonly now?: DateTime;
  readonly expectedVersion: VersionNumber;
}

export function updateGroup(current: Group, input: GroupUpdateInput): Group {
  if (current.version !== input.expectedVersion) {
    throw new VersionConflictError(
      `Group version conflict: expected ${input.expectedVersion}, got ${current.version}`,
      input.expectedVersion as number,
      current.version as number,
    );
  }
  if (current.deletedAt) {
    throw new Error(`Group ${current.id} is deleted and cannot be updated`);
  }
  if (input.name !== undefined) validateGroupName(input.name);
  if (input.description !== undefined) validateGroupDescription(input.description);
  const now = input.now ?? nowDateTime();
  return {
    ...current,
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description.trim() } : {}),
    updatedAt: asDateTime(now),
    version: asVersionNumber(current.version + 1),
  };
}

export interface GroupSoftDeleteInput {
  readonly now?: DateTime;
  readonly expectedVersion: VersionNumber;
}

export function softDeleteGroup(current: Group, input: GroupSoftDeleteInput): Group {
  if (current.version !== input.expectedVersion) {
    throw new VersionConflictError(
      `Group version conflict: expected ${input.expectedVersion}, got ${current.version}`,
      input.expectedVersion as number,
      current.version as number,
    );
  }
  if (current.deletedAt) {
    throw new Error(`Group ${current.id} is already deleted`);
  }
  const now = input.now ?? nowDateTime();
  return {
    ...current,
    deletedAt: asDateTime(now),
    updatedAt: asDateTime(now),
    version: asVersionNumber(current.version + 1),
  };
}

export function isGroupActive(group: Group): boolean {
  return group.deletedAt === undefined;
}

export function validateGroupName(name: string): void {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new EmptyValueError('Group name must not be empty');
  }
  if (trimmed.length > GROUP_NAME_MAX_LENGTH) {
    throw new ValueTooLongError(
      `Group name too long: ${trimmed.length} > ${GROUP_NAME_MAX_LENGTH}`,
      'name',
      GROUP_NAME_MAX_LENGTH,
      trimmed.length,
    );
  }
}

export function validateGroupDescription(description: string): void {
  if (description.length > GROUP_DESCRIPTION_MAX_LENGTH) {
    throw new ValueTooLongError(
      `Group description too long: ${description.length} > ${GROUP_DESCRIPTION_MAX_LENGTH}`,
      'description',
      GROUP_DESCRIPTION_MAX_LENGTH,
      description.length,
    );
  }
}
