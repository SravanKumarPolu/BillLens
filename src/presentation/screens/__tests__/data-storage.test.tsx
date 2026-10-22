/**
 * Data & storage view tests.
 *
 * Pins the safety affordances: removal is offered only for eligible
 * groups, never when cloud sync is configured, and export is always
 * available offline.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import type { RetentionRow } from '@application/retention/assess-retention.usecase';
import { DataStorageView } from '@presentation/screens/settings/DataStorageScreen';

function row(overrides: Partial<RetentionRow> = {}): RetentionRow {
  return {
    groupId: 'g1',
    groupName: 'Goa trip',
    state: 'eligible',
    eligibleAt: '2025-01-01T00:00:00.000Z',
    daysUntilEligible: 0,
    reasons: ['No activity for at least 365 days and no unsettled records.'],
    lastActivityAt: '2024-01-01T10:00:00.000Z',
    hasOutstandingBalance: false,
    pendingConfirmations: 0,
    pendingLocalChanges: 0,
    ...overrides,
  };
}

function renderView(overrides: Partial<Parameters<typeof DataStorageView>[0]> = {}) {
  const props: Parameters<typeof DataStorageView>[0] = {
    cloudSyncEnabled: false,
    retentionDays: 365,
    retentionMode: 'review',
    onChangeRetention: jest.fn(),
    onChangeRetentionMode: jest.fn(),
    rows: [row()],
    loading: false,
    busy: false,
    message: null,
    onExportJson: jest.fn(),
    onExportCsv: jest.fn(),
    onRemoveLocalCopy: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<DataStorageView {...props} />) };
}

describe('DataStorageView', () => {
  it('offers export even with no groups', () => {
    const { getByLabelText } = renderView({ rows: [] });
    expect(getByLabelText('Export a JSON backup of your local data')).toBeTruthy();
    expect(getByLabelText('Export expenses as CSV')).toBeTruthy();
  });

  it('offers removal for an eligible local-only group', () => {
    const { getByLabelText } = renderView();
    fireEvent.press(getByLabelText('Remove the local copy of Goa trip'));
  });

  it('shows the retention state for protected groups and no remove action', () => {
    const { getByText, queryByLabelText } = renderView({
      rows: [row({ state: 'protected', reasons: ['Unsettled balances remain in this group.'] })],
    });
    expect(getByText('Protected')).toBeTruthy();
    expect(getByText(/Unsettled balances remain/)).toBeTruthy();
    expect(queryByLabelText('Remove the local copy of Goa trip')).toBeNull();
  });

  it('never offers removal while cloud sync is configured', () => {
    const { getByText, queryByLabelText } = renderView({ cloudSyncEnabled: true });
    expect(getByText(/Cloud sync is configured/)).toBeTruthy();
    expect(queryByLabelText('Remove the local copy of Goa trip')).toBeNull();
  });

  it('shows days remaining for a recent group', () => {
    const { getByText } = renderView({
      rows: [row({ state: 'too_recent', daysUntilEligible: 12 })],
    });
    expect(getByText('Eligible in 12 days')).toBeTruthy();
  });
});
