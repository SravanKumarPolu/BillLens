/**
 * ExpenseDetailScreen tests.
 *
 * Verifies the pure presentational component renders the loaded view
 * (title, total, payers, shares, invariants, note, category) and the
 * error state. The container's service interaction is covered by the
 * use-case tests over the real SQLite adapters.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import type { ExpenseDetailView } from '@application/expenses/get-expense-detail.usecase';
import {
  ExpenseDetailScreenView,
  ExpenseDetailScreen,
} from '@presentation/screens/expense/ExpenseDetailScreen';

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

function makeView(overrides: Partial<ExpenseDetailView> = {}): ExpenseDetailView {
  return {
    expenseId: 'e_test',
    title: 'Dinner',
    amountMinor: 3000,
    currencyCode: 'USD',
    expenseDate: '2026-10-11T10:00:00.000Z',
    splitType: 'equal',
    note: null,
    category: null,
    payers: [
      { memberId: 'm1', displayName: 'Alice', amountMinor: 3000, isSinglePayer: true },
    ],
    shares: [
      { memberId: 'm1', displayName: 'Alice', amountMinor: 1000, isPayer: true },
      { memberId: 'm2', displayName: 'Bob', amountMinor: 1000, isPayer: false },
      { memberId: 'm3', displayName: 'Carol', amountMinor: 1000, isPayer: false },
    ],
    sharesTotalMinor: 3000,
    payersTotalMinor: 3000,
    participantCount: 3,
    ...overrides,
  };
}

describe('ExpenseDetailScreenView', () => {
  it('renders the title, total, and date', () => {
    const view = makeView();
    const { getByText } = render(<ExpenseDetailScreenView view={view} onBack={() => {}} />);
    expect(getByText('Dinner')).toBeTruthy();
    expect(getByText('Total')).toBeTruthy();
    expect(getByText(/Oct 11/)).toBeTruthy();
    expect(getByText(/EQUAL split/)).toBeTruthy();
  });

  it('renders the Reconciled badge when shares+payments match the total', () => {
    const view = makeView();
    const { getByLabelText } = render(<ExpenseDetailScreenView view={view} onBack={() => {}} />);
    expect(getByLabelText('Shares and payers match the total')).toBeTruthy();
  });

  it('renders the Out of balance badge when shares do not match the total', () => {
    const view = makeView({ sharesTotalMinor: 2999 });
    const { getByLabelText } = render(<ExpenseDetailScreenView view={view} onBack={() => {}} />);
    expect(getByLabelText('Shares or payers do not match the total')).toBeTruthy();
  });

  it('renders all payer rows with their display names', () => {
    const view = makeView({
      payers: [
        { memberId: 'm1', displayName: 'Alice', amountMinor: 1500, isSinglePayer: false },
        { memberId: 'm2', displayName: 'Bob', amountMinor: 1500, isSinglePayer: false },
      ],
    });
    const { getByText, getAllByText } = render(<ExpenseDetailScreenView view={view} onBack={() => {}} />);
    expect(getByText('Payers')).toBeTruthy();
    expect(getAllByText('Alice').length).toBeGreaterThan(0);
    expect(getAllByText('Bob').length).toBeGreaterThan(0);
    expect(getAllByText('Contribution').length).toBeGreaterThan(0);
  });

  it('renders the "Paid by" header when single-payer', () => {
    const view = makeView();
    const { getByText } = render(<ExpenseDetailScreenView view={view} onBack={() => {}} />);
    expect(getByText('Paid by')).toBeTruthy();
    expect(getByText('Paid the full amount')).toBeTruthy();
  });

  it('renders all share rows with the payer-offset label', () => {
    const view = makeView();
    const { getByText, getAllByText } = render(<ExpenseDetailScreenView view={view} onBack={() => {}} />);
    expect(getByText('Split breakdown')).toBeTruthy();
    expect(getByText('Payer (offset by their contribution)')).toBeTruthy();
    expect(getAllByText('Owes').length).toBeGreaterThan(0);
  });

  it('renders the note and category when present', () => {
    const view = makeView({ note: 'Birthday dinner', category: 'Food' });
    const { getByText } = render(<ExpenseDetailScreenView view={view} onBack={() => {}} />);
    expect(getByText('Food')).toBeTruthy();
    expect(getByText('Birthday dinner')).toBeTruthy();
  });

  it('hides the note+category card when both are null', () => {
    const view = makeView({ note: null, category: null });
    const { queryByText } = render(<ExpenseDetailScreenView view={view} onBack={() => {}} />);
    expect(queryByText('Birthday dinner')).toBeNull();
    expect(queryByText('Food')).toBeNull();
  });

  it('calls onBack when the Back button is pressed', () => {
    const handleBack = jest.fn();
    const view = makeView();
    const { getByLabelText } = render(<ExpenseDetailScreenView view={view} onBack={(): void => { handleBack(); }} />);
    fireEvent.press(getByLabelText('Go back'));
    expect(handleBack).toHaveBeenCalledTimes(1);
  });
});

describe('ExpenseDetailScreen (container)', () => {
  it('renders the error card when the services are not ready', async () => {
    // Without `setAppServicesForTesting`, the services gate is null.
    const { getByText } = render(<ExpenseDetailScreen expenseId="e_x" />);
    // Wait for the effect to settle.
    await new Promise((r) => setTimeout(r, 10));
    expect(getByText('Could not load this expense')).toBeTruthy();
    expect(getByText(/Storage is still starting up/i)).toBeTruthy();
  });
});
