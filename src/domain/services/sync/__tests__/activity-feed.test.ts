import { describe, expect, it } from '@jest/globals';

import { asDateTime } from '@domain/value-objects';

import {
  filterActivityEvents,
  buildActivityMessage,
  redactActivityEventData,
  ALL_ACTIVITY_EVENT_TYPES,
  type ActivityEvent,
} from '../activity-feed';

const NOW = asDateTime('2026-10-10T10:00:00.000Z');

function makeEvent(
  eventType: ActivityEvent['eventType'],
  overrides: Partial<ActivityEvent> = {},
): ActivityEvent {
  return {
    id: `evt-${eventType}`,
    eventType,
    occurredAt: NOW,
    visibility: 'group',
    ...overrides,
  };
}

describe('Activity feed', () => {
  describe('filterActivityEvents', () => {
    const events = [
      makeEvent('expense_created'),
      makeEvent('settlement_confirmed'),
      makeEvent('member_added'),
      makeEvent('group_created'),
      makeEvent('conflict_resolved'),
      makeEvent('expense_edited', { actorMemberId: 'm-1' as never }),
    ];

    it('filters expenses', () => {
      const filtered = filterActivityEvents(events, 'expenses');
      expect(filtered).toHaveLength(2);
      expect(filtered[0]?.eventType).toBe('expense_created');
    });

    it('filters settlements', () => {
      const filtered = filterActivityEvents(events, 'settlements');
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.eventType).toBe('settlement_confirmed');
    });

    it('filters members', () => {
      const filtered = filterActivityEvents(events, 'members');
      expect(filtered).toHaveLength(1);
    });

    it('filters my_activity', () => {
      const filtered = filterActivityEvents(events, 'my_activity', 'm-1' as never);
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.eventType).toBe('expense_edited');
    });

    it('returns all for "all" filter', () => {
      expect(filterActivityEvents(events, 'all')).toHaveLength(events.length);
    });
  });

  describe('buildActivityMessage', () => {
    it('builds expense_created message', () => {
      const event = makeEvent('expense_created', {
        actorDisplayName: 'Maya',
        eventData: { title: 'Dinner' },
      });
      const msg = buildActivityMessage(event, '£62.00');
      expect(msg).toBe('Maya added Dinner for £62.00.');
    });

    it('builds expense_edited message with old and new amounts', () => {
      const event = makeEvent('expense_edited', {
        actorDisplayName: 'Alex',
        eventData: { title: 'Dinner', oldAmountMinor: 6000, newAmountMinor: 6200 },
      });
      const msg = buildActivityMessage(event);
      expect(msg).toBe('Alex changed the Dinner total from 60.00 to 62.00.');
    });

    it('builds settlement_reversed message', () => {
      const event = makeEvent('settlement_reversed', {
        actorDisplayName: 'Priya',
      });
      const msg = buildActivityMessage(event, '£20.00');
      expect(msg).toBe('Priya reversed a £20.00 settlement.');
    });

    it('builds member_added message', () => {
      const event = makeEvent('member_added', {
        actorDisplayName: 'Maya',
        eventData: { memberName: 'Alex' },
      });
      const msg = buildActivityMessage(event);
      expect(msg).toBe('Maya added Alex to the group.');
    });
  });

  describe('redactActivityEventData', () => {
    it('redacts sensitive fields', () => {
      const data = {
        title: 'Dinner',
        paymentReferenceHash: 'abc123',
        amountMinor: 5000,
      };
      const redacted = redactActivityEventData(data);
      expect(redacted['title']).toBe('Dinner');
      expect(redacted['paymentReferenceHash']).toBe('[REDACTED]');
      expect(redacted['amountMinor']).toBe(5000);
    });
  });

  it('ALL_ACTIVITY_EVENT_TYPES has 18 types', () => {
    expect(ALL_ACTIVITY_EVENT_TYPES).toHaveLength(18);
  });
});
