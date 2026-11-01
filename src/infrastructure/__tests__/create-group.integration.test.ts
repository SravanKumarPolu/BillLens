/**
 * CreateGroupUseCase integration tests.
 *
 * Verifies the use case writes the group + owner member to the SQLite
 * repository, appends the audit-log entry, sets the owner member's
 * `userId` to the supplied `createdBy` (so the dashboard can find
 * "my member" per group), and is idempotent on `groupId` retry.
 */

import { beforeEach, describe, expect, it } from '@jest/globals';

import { CreateGroupUseCase } from '@application/groups/create-group.usecase';
import { InvalidEntityError } from '@domain/errors';
import { InMemoryDatabase } from '@infrastructure/__tests__/in-memory-database';
import type { AppServices } from '@infrastructure/composition-root';
import { createCompositionRoot } from '@infrastructure/composition-root';
import { runMigrations } from '@infrastructure/sqlite/schema';

let services: AppServices;
let useCase: CreateGroupUseCase;

beforeEach(async () => {
  const db = new InMemoryDatabase();
  await runMigrations(db);
  services = createCompositionRoot({ database: db });
  useCase = new CreateGroupUseCase(
    services.repositories.groups,
    services.repositories.members,
    services.repositories.audit,
  );
});

describe('CreateGroupUseCase (integration)', () => {
  it('persists the group + owner member with userId=createdBy', async () => {
    const result = await useCase.execute({
      groupId: 'g_create_1',
      name: 'Goa Trip',
      currencyCode: 'INR',
      createdBy: 'local-user',
      ownerMemberId: 'm_owner_1',
    });

    expect(result.groupId).toBe('g_create_1');
    expect(result.ownerId).toBe('m_owner_1');

    // The group is in the SQLite repository.
    const group = await services.repositories.groups.findById('g_create_1' as never);
    expect(group).not.toBeNull();
    expect(group!.name).toBe('Goa Trip');
    expect(group!.currencyCode as string).toBe('INR');
    expect(group!.createdBy as string).toBe('local-user');

    // The owner member is in the SQLite repository with userId=local-user.
    const members = await services.repositories.members.listActiveByGroup('g_create_1' as never);
    expect(members).toHaveLength(1);
    expect(members[0]!.id as string).toBe('m_owner_1');
    expect(members[0]!.userId as string).toBe('local-user');
    expect(members[0]!.role).toBe('owner');
  });

  it('appends an audit-log entry for the create action', async () => {
    await useCase.execute({
      groupId: 'g_create_2',
      name: 'Audit Test Group',
      currencyCode: 'USD',
      createdBy: 'local-user',
      ownerMemberId: 'm_owner_2',
    });

    const auditEntries = await services.repositories.audit.listByEntity('group', 'g_create_2');
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0]!.action).toBe('create');
    expect(auditEntries[0]!.actorId as string).toBe('local-user');
  });

  it('is idempotent on groupId retry', async () => {
    // First call creates the group.
    await useCase.execute({
      groupId: 'g_create_3',
      name: 'Idempotent Group',
      currencyCode: 'USD',
      createdBy: 'local-user',
      ownerMemberId: 'm_owner_3',
    });
    // Retry with the same ids — the repository's upsert semantics make
    // this a no-op rather than a duplicate.
    await expect(
      useCase.execute({
        groupId: 'g_create_3',
        name: 'Idempotent Group',
        currencyCode: 'USD',
        createdBy: 'local-user',
        ownerMemberId: 'm_owner_3',
      }),
    ).resolves.toEqual({ groupId: 'g_create_3', ownerId: 'm_owner_3' });

    // Still only one group + one member.
    const group = await services.repositories.groups.findById('g_create_3' as never);
    expect(group).not.toBeNull();
    const members = await services.repositories.members.listActiveByGroup('g_create_3' as never);
    expect(members).toHaveLength(1);
  });

  it('rejects an empty name', async () => {
    await expect(
      useCase.execute({
        groupId: 'g_x',
        name: '   ',
        currencyCode: 'USD',
        createdBy: 'local-user',
        ownerMemberId: 'm_x',
      }),
    ).rejects.toThrow(InvalidEntityError);
  });

  it('rejects an empty currency code', async () => {
    await expect(
      useCase.execute({
        groupId: 'g_x',
        name: 'Trip',
        currencyCode: '',
        createdBy: 'local-user',
        ownerMemberId: 'm_x',
      }),
    ).rejects.toThrow(InvalidEntityError);
  });

  it('rejects an empty createdBy', async () => {
    await expect(
      useCase.execute({
        groupId: 'g_x',
        name: 'Trip',
        currencyCode: 'USD',
        createdBy: '',
        ownerMemberId: 'm_x',
      }),
    ).rejects.toThrow(InvalidEntityError);
  });

  it('write→read coherence: the new group is immediately visible to the balance engine', async () => {
    await useCase.execute({
      groupId: 'g_balance_test',
      name: 'Balance Test',
      currencyCode: 'USD',
      createdBy: 'local-user',
      ownerMemberId: 'm_balance_owner',
    });

    // ListGroupMembersUseCase must see the new group + owner.
    const result = await services.groups.listGroupMembers.execute('g_balance_test');
    expect(result.groupName).toBe('Balance Test');
    expect(result.currencyCode).toBe('USD');
    expect(result.members).toHaveLength(1);
    expect(result.members[0]!.id).toBe('m_balance_owner');
    expect(result.members[0]!.isRegisteredUser).toBe(true);
  });
});
