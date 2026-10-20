import { describe, expect, it } from '@jest/globals';

import { asDateTime } from '@domain/value-objects';

import {
  reconcileChange,
  shouldCancelPendingOperationForRevocation,
  type RemoteChange,
} from '../incremental-download';

const NOW = asDateTime('2026-10-10T10:00:00.000Z');

function makeChange(
  entityType: string = 'expense',
  entityId: string = 'e-1',
  changeType: 'create' | 'update' | 'delete' | 'restore' = 'create',
  version: number = 2,
): RemoteChange {
  return {
    entityType: entityType as never,
    entityId,
    changeType: changeType as never,
    version,
    payload: { title: 'Test' },
    occurredAt: NOW,
  };
}

describe('Incremental download reconciliation', () => {
  it('applies remote when there is no local record', () => {
    const result = reconcileChange({
      remoteChange: makeChange(),
      localVersion: null,
      baseVersion: 0,
      hasLocalPending: false,
    });
    expect(result.action).toBe('apply_remote');
  });

  it('skips when same version', () => {
    const result = reconcileChange({
      remoteChange: makeChange('expense', 'e-1', 'update', 2),
      localVersion: 2,
      baseVersion: 1,
      hasLocalPending: false,
    });
    expect(result.action).toBe('skip_same_version');
  });

  it('applies remote when remote is newer and local is clean', () => {
    const result = reconcileChange({
      remoteChange: makeChange('expense', 'e-1', 'update', 3),
      localVersion: 2,
      baseVersion: 1,
      hasLocalPending: false,
    });
    expect(result.action).toBe('apply_remote_newer');
  });

  it('continues upload when local is pending and remote unchanged from base', () => {
    const result = reconcileChange({
      remoteChange: makeChange('expense', 'e-1', 'update', 1),
      localVersion: 2,
      baseVersion: 1,
      hasLocalPending: true,
    });
    expect(result.action).toBe('continue_upload');
  });

  it('creates conflict when local pending and remote changed', () => {
    const result = reconcileChange({
      remoteChange: makeChange('expense', 'e-1', 'update', 3),
      localVersion: 2,
      baseVersion: 1,
      hasLocalPending: true,
    });
    expect(result.action).toBe('create_conflict');
  });

  it('creates high-priority conflict for remote deletion with local pending edit', () => {
    const result = reconcileChange({
      remoteChange: makeChange('expense', 'e-1', 'delete', 3),
      localVersion: 2,
      baseVersion: 1,
      hasLocalPending: true,
    });
    expect(result.action).toBe('create_high_priority_conflict');
  });
});

describe('Permission revocation', () => {
  it('cancels group-scoped operations for revoked groups', () => {
    const revocation = {
      groupId: 'g-1',
      memberId: 'm-1',
      revokedAt: NOW,
      reason: 'removed' as const,
    };
    expect(
      shouldCancelPendingOperationForRevocation(
        { entityType: 'expense' as never, entityId: 'e-1' },
        revocation,
      ),
    ).toBe(true);
    expect(
      shouldCancelPendingOperationForRevocation(
        { entityType: 'settlement' as never, entityId: 's-1' },
        revocation,
      ),
    ).toBe(true);
    expect(
      shouldCancelPendingOperationForRevocation(
        { entityType: 'preference' as never, entityId: 'p-1' },
        revocation,
      ),
    ).toBe(false);
  });
});
