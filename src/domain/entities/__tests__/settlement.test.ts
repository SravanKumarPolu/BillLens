import { describe, expect, it } from '@jest/globals';

import {
  asGroupId,
  asMemberId,
  asSettlementId,
  asUserId,
  createSettlement,
  softDeleteSettlement,
} from '../../entities/index';
import { DeletedEntityError, InvalidEntityError } from '../../errors/index';
import { asDateTime } from '../../value-objects/index';

const NOW = asDateTime('2026-07-29T10:00:00.000Z');
const USER_ID = asUserId('user-1');
const GROUP_ID = asGroupId('group-1');

describe('Settlement entity', () => {
  it('creates a valid settlement', () => {
    const s = createSettlement({
      id: asSettlementId('s-1'),
      groupId: GROUP_ID,
      fromMemberId: asMemberId('m-1'),
      toMemberId: asMemberId('m-2'),
      amountMinor: 500,
      currencyCode: 'INR',
      method: 'upi',
      createdBy: USER_ID,
      now: NOW,
    });
    expect(s.amountMinor).toBe(500);
    expect(s.fromMemberId).toBe(asMemberId('m-1'));
    expect(s.toMemberId).toBe(asMemberId('m-2'));
    expect(s.method).toBe('upi');
    expect(s.version).toBe(1);
  });

  it('rejects same from/to member', () => {
    expect(() =>
      createSettlement({
        id: asSettlementId('s-1'),
        groupId: GROUP_ID,
        fromMemberId: asMemberId('m-1'),
        toMemberId: asMemberId('m-1'),
        amountMinor: 500,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ID,
        now: NOW,
      }),
    ).toThrow(InvalidEntityError);
  });

  it('rejects zero amount', () => {
    expect(() =>
      createSettlement({
        id: asSettlementId('s-1'),
        groupId: GROUP_ID,
        fromMemberId: asMemberId('m-1'),
        toMemberId: asMemberId('m-2'),
        amountMinor: 0,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ID,
        now: NOW,
      }),
    ).toThrow(InvalidEntityError);
  });

  it('rejects negative amount', () => {
    expect(() =>
      createSettlement({
        id: asSettlementId('s-1'),
        groupId: GROUP_ID,
        fromMemberId: asMemberId('m-1'),
        toMemberId: asMemberId('m-2'),
        amountMinor: -100,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ID,
        now: NOW,
      }),
    ).toThrow(InvalidEntityError);
  });

  it('rejects non-integer amount', () => {
    expect(() =>
      createSettlement({
        id: asSettlementId('s-1'),
        groupId: GROUP_ID,
        fromMemberId: asMemberId('m-1'),
        toMemberId: asMemberId('m-2'),
        amountMinor: 500.5,
        currencyCode: 'INR',
        method: 'upi',
        createdBy: USER_ID,
        now: NOW,
      }),
    ).toThrow(InvalidEntityError);
  });

  it('soft-deletes a settlement', () => {
    const s = createSettlement({
      id: asSettlementId('s-1'),
      groupId: GROUP_ID,
      fromMemberId: asMemberId('m-1'),
      toMemberId: asMemberId('m-2'),
      amountMinor: 500,
      currencyCode: 'INR',
      method: 'upi',
      createdBy: USER_ID,
      now: NOW,
    });
    const deleted = softDeleteSettlement(s, {
      now: asDateTime('2026-07-30T10:00:00.000Z'),
      expectedVersion: 1 as never,
    });
    expect(deleted.deletedAt).toBe('2026-07-30T10:00:00.000Z');
    expect(deleted.version).toBe(2);
  });

  it('cannot soft-delete twice', () => {
    const s = createSettlement({
      id: asSettlementId('s-1'),
      groupId: GROUP_ID,
      fromMemberId: asMemberId('m-1'),
      toMemberId: asMemberId('m-2'),
      amountMinor: 500,
      currencyCode: 'INR',
      method: 'upi',
      createdBy: USER_ID,
      now: NOW,
    });
    const deleted = softDeleteSettlement(s, {
      now: asDateTime('2026-07-30T10:00:00.000Z'),
      expectedVersion: 1 as never,
    });
    expect(() =>
      softDeleteSettlement(deleted, {
        now: asDateTime('2026-07-31T10:00:00.000Z'),
        expectedVersion: 2 as never,
      }),
    ).toThrow(DeletedEntityError);
  });
});
