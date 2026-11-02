import { describe, expect, it } from '@jest/globals';

import {
  asDraftChargeId,
  asDraftLineItemId,
  asMemberId,
  createDraftCharge,
  createDraftLineItem,
} from '@domain/entities';
import { InvalidEntityError } from '@domain/errors';
import type { MemberId } from '@shared-types/index';

import {
  assignAllUnassigned,
  assignItem,
  assignItemToMembers,
  computeAssignmentSummary,
  copyAssignment,
  createAssignmentSession,
  splitItemsEqually,
  unassignItem,
  validateAssignments,
} from '../index';

const GROUP_ID = 'group-1';
const A: MemberId = asMemberId('a');
const B: MemberId = asMemberId('b');
const C: MemberId = asMemberId('c');

function makeItem(id: string, unitPriceMinor: number, assigned: MemberId[] = []) {
  return createDraftLineItem({
    id: asDraftLineItemId(id),
    name: `Item ${id}`,
    quantity: 1,
    unitPriceMinor,
    assignedMemberIds: assigned,
  });
}

function makeCharge(id: string, amountMinor: number) {
  return createDraftCharge({
    id: asDraftChargeId(id),
    type: 'tax',
    amountMinor,
  });
}

describe('item-assignment session + service', () => {
  it('createAssignmentSession aggregates totals and unassigned ids', () => {
    const items = [makeItem('i1', 1000), makeItem('i2', 500), makeItem('i3', 250)];
    const session = createAssignmentSession(GROUP_ID, [A, B, C], items);

    expect(session.groupId).toBe(GROUP_ID);
    expect(session.memberIds).toEqual([A, B, C]);
    expect(session.items).toHaveLength(3);
    expect(session.totalItemsMinor).toBe(1750);
    expect(session.totalAssignedMinor).toBe(0);
    expect(session.totalUnassignedMinor).toBe(1750);
    expect(session.unassignedItemIds).toEqual(['i1', 'i2', 'i3']);
    expect(session.assignments.size).toBe(0);
  });

  it('createAssignmentSession respects pre-existing assignments', () => {
    const items = [
      makeItem('i1', 1000, [A]),
      makeItem('i2', 500), // unassigned
    ];
    const session = createAssignmentSession(GROUP_ID, [A, B, C], items);

    expect(session.totalAssignedMinor).toBe(1000);
    expect(session.totalUnassignedMinor).toBe(500);
    expect(session.unassignedItemIds).toEqual(['i2']);
    expect(session.assignments.get('i1')).toEqual([A]);
  });

  it('assignItem assigns a single item to a single member', () => {
    const session = createAssignmentSession(GROUP_ID, [A, B, C], [makeItem('i1', 1000)]);
    const next = assignItem(session, 'i1', A);

    expect(next.assignments.get('i1')).toEqual([A]);
    expect(next.unassignedItemIds).toEqual([]);
    expect(next.totalAssignedMinor).toBe(1000);
    expect(next.totalUnassignedMinor).toBe(0);
  });

  it('assignItemToMembers splits an item across multiple members', () => {
    const session = createAssignmentSession(GROUP_ID, [A, B, C], [makeItem('i1', 1000)]);
    const next = assignItemToMembers(session, 'i1', [A, B]);

    expect(next.assignments.get('i1')).toEqual([A, B]);
    // The underlying DraftLineItem.assignedMemberIds is updated too.
    expect(next.items[0]?.assignedMemberIds).toEqual([A, B]);
  });

  it('assignItemToMembers rejects unknown members', () => {
    const session = createAssignmentSession(GROUP_ID, [A, B, C], [makeItem('i1', 1000)]);
    expect(() => assignItemToMembers(session, 'i1', [asMemberId('zzz')])).toThrow(InvalidEntityError);
  });

  it('assignItemToMembers rejects empty member list', () => {
    const session = createAssignmentSession(GROUP_ID, [A, B, C], [makeItem('i1', 1000)]);
    expect(() => assignItemToMembers(session, 'i1', [])).toThrow(InvalidEntityError);
  });

  it('splitItemsEqually assigns selected items to all session members', () => {
    const session = createAssignmentSession(
      GROUP_ID,
      [A, B, C],
      [makeItem('i1', 1000), makeItem('i2', 500), makeItem('i3', 250)],
    );
    const next = splitItemsEqually(session, ['i1', 'i2']);

    expect(next.assignments.get('i1')).toEqual([A, B, C]);
    expect(next.assignments.get('i2')).toEqual([A, B, C]);
    // i3 was not selected — remains unassigned.
    expect(next.assignments.has('i3')).toBe(false);
    expect(next.unassignedItemIds).toEqual(['i3']);
    expect(next.totalAssignedMinor).toBe(1500);
  });

  it('assignAllUnassigned sweeps every unassigned item to one member', () => {
    const items = [makeItem('i1', 1000, [A]), makeItem('i2', 500), makeItem('i3', 250)];
    const session = createAssignmentSession(GROUP_ID, [A, B, C], items);
    const next = assignAllUnassigned(session, B);

    expect(next.assignments.get('i1')).toEqual([A]); // untouched
    expect(next.assignments.get('i2')).toEqual([B]);
    expect(next.assignments.get('i3')).toEqual([B]);
    expect(next.unassignedItemIds).toEqual([]);
    expect(next.totalAssignedMinor).toBe(1750);
  });

  it('copyAssignment clones the source item assignment onto the target', () => {
    const items = [makeItem('i1', 1000, [A, B]), makeItem('i2', 500)];
    const session = createAssignmentSession(GROUP_ID, [A, B, C], items);
    const next = copyAssignment(session, 'i1', 'i2');

    expect(next.assignments.get('i2')).toEqual([A, B]);
  });

  it('copyAssignment throws when the source item is unknown', () => {
    const session = createAssignmentSession(GROUP_ID, [A, B, C], [makeItem('i1', 1000)]);
    expect(() => copyAssignment(session, 'nope', 'i1')).toThrow(InvalidEntityError);
  });

  it('unassignItem removes the assignment for an item', () => {
    const items = [makeItem('i1', 1000, [A]), makeItem('i2', 500)];
    const session = createAssignmentSession(GROUP_ID, [A, B, C], items);
    const next = unassignItem(session, 'i1');

    expect(next.assignments.has('i1')).toBe(false);
    expect(next.unassignedItemIds).toEqual(['i1', 'i2']);
    expect(next.totalAssignedMinor).toBe(0);
    expect(next.totalUnassignedMinor).toBe(1500);
  });
});

describe('assignment-validator', () => {
  it('flags unassigned items as invalid', () => {
    const session = createAssignmentSession(
      GROUP_ID,
      [A, B, C],
      [makeItem('i1', 1000), makeItem('i2', 500)],
    );
    const result = validateAssignments(session, [], 1500);

    expect(result.isValid).toBe(false);
    expect(result.unassignedCount).toBe(2);
    expect(result.errors.some((e) => e.includes('no member assignment'))).toBe(true);
    // Totals still reconcile.
    expect(result.computedTotalMinor).toBe(1500);
    expect(result.expectedTotalMinor).toBe(1500);
  });

  it('detects a total mismatch between items + charges and the expected total', () => {
    const session = createAssignmentSession(
      GROUP_ID,
      [A, B, C],
      [makeItem('i1', 1000, [A]), makeItem('i2', 500, [B])],
    );
    // Items sum to 1500, no charges, but expected total = 1499 → mismatch.
    const result = validateAssignments(session, [], 1499);

    expect(result.isValid).toBe(false);
    expect(result.computedTotalMinor).toBe(1500);
    expect(result.expectedTotalMinor).toBe(1499);
    expect(result.errors.some((e) => e.includes('does not match expected total'))).toBe(true);
  });

  it('passes when everything is assigned and totals reconcile', () => {
    const session = createAssignmentSession(
      GROUP_ID,
      [A, B],
      [makeItem('i1', 1000, [A]), makeItem('i2', 500, [B])],
    );
    const charges = [makeCharge('c1', 200), makeCharge('c2', 50)];
    // items (1500) + charges (250) = 1750
    const result = validateAssignments(session, charges, 1750);

    expect(result.isValid).toBe(true);
    expect(result.totalItemsMinor).toBe(1500);
    expect(result.totalChargesMinor).toBe(250);
    expect(result.computedTotalMinor).toBe(1750);
    expect(result.errors).toEqual([]);
  });
});

describe('assignment-summary', () => {
  it('computes per-member item totals and counts', () => {
    // i1 (1000) → [A]; i2 (500) → [B, C]
    const items = [
      makeItem('i1', 1000, [A]),
      makeItem('i2', 500, [B, C]),
    ];
    const session = createAssignmentSession(GROUP_ID, [A, B, C], items);
    const summary = computeAssignmentSummary(session, []);

    const aSummary = summary.find((s) => s.memberId === A);
    const bSummary = summary.find((s) => s.memberId === B);
    const cSummary = summary.find((s) => s.memberId === C);

    expect(aSummary?.itemCount).toBe(1);
    expect(aSummary?.itemsTotalMinor).toBe(1000);
    expect(bSummary?.itemCount).toBe(1);
    expect(bSummary?.itemsTotalMinor).toBe(250);
    expect(cSummary?.itemCount).toBe(1);
    expect(cSummary?.itemsTotalMinor).toBe(250);
  });

  it('distributes charges proportionally to each member\'s item total', () => {
    // m1 has 1000 in items; m2 has 500; m3 has 0. Total assigned = 1500.
    const items = [
      makeItem('i1', 1000, [A]),
      makeItem('i2', 500, [B]),
    ];
    const session = createAssignmentSession(GROUP_ID, [A, B, C], items);
    const charges = [makeCharge('c1', 300)]; // 300 minor units of charges
    const summary = computeAssignmentSummary(session, charges);

    const aSummary = summary.find((s) => s.memberId === A);
    const bSummary = summary.find((s) => s.memberId === B);
    const cSummary = summary.find((s) => s.memberId === C);

    // Proportional shares: A=200, B=100, C=0.
    expect(aSummary?.chargesShareMinor).toBe(200);
    expect(bSummary?.chargesShareMinor).toBe(100);
    expect(cSummary?.chargesShareMinor).toBe(0);

    // Grand totals include both items and proportional charges.
    expect(aSummary?.grandTotalMinor).toBe(1200);
    expect(bSummary?.grandTotalMinor).toBe(600);
    expect(cSummary?.grandTotalMinor).toBe(0);
  });

  it('falls back to even split of charges when nothing is assigned', () => {
    const items = [makeItem('i1', 1000)]; // unassigned
    const session = createAssignmentSession(GROUP_ID, [A, B, C], items);
    const charges = [makeCharge('c1', 300)];
    const summary = computeAssignmentSummary(session, charges);

    // Even split: Math.floor(300 / 3) = 100 each.
    expect(summary.every((s) => s.chargesShareMinor === 100)).toBe(true);
  });
});
