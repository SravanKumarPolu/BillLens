/**
 * Balance explanation screen component tests (Prompt 19).
 *
 * Uses `@testing-library/react-native` to render the presentational
 * `BalanceExplanationView` (and the thin `BalanceExplanationScreen`
 * container) with synthetic view models. `expo-router` is mocked.
 *
 * Coverage:
 *   - Creditor case (positive balance): "You are owed" badge + positive summary
 *   - Debtor case (negative balance): "You owe" badge + negative summary
 *   - Settled case (zero balance): "Settled" badge + settled summary
 *   - Contributions list rendering
 *   - Settlement impacts list rendering
 *   - Rounding notes list rendering
 *   - Empty-state fallbacks
 *   - Close button invokes onClose
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import type { BalanceExplanation } from '@domain/explanations/explanation-types';
import { BalanceExplanationScreen, BalanceExplanationView } from '@presentation/screens/balances/BalanceExplanationScreen';
import {
  type BalanceExplanationViewModel,
  createBalanceExplanationViewModel,
  createEmptyBalanceExplanation,
} from '@presentation/view-models/balance-explanation';
import type { MemberId } from '@shared-types/index';

// Mock expo-router.
const mockRouterDismiss = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: {
    dismiss: (...args: readonly unknown[]) => mockRouterDismiss(...args),
  },
}));

/** Wrap children in the providers the design system expects. */
function renderWithProviders(ui: ReactElement): ReturnType<typeof render> {
  return render(ui);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const A: MemberId = 'm_a' as MemberId;
const B: MemberId = 'm_b' as MemberId;

function makeBalance(overrides: Partial<BalanceExplanation> = {}): BalanceExplanation {
  return {
    memberId: A,
    paidMinor: 0,
    shareMinor: 0,
    settlementsSentMinor: 0,
    settlementsReceivedMinor: 0,
    netBalanceMinor: 0,
    expenseContributions: [],
    settlementImpact: [],
    roundingNotes: [],
    summaryKey: 'settled',
    summaryText: 'A is settled.',
    ...overrides,
  };
}

function makeViewModel(
  explanation: BalanceExplanation,
  memberName = 'Priya',
  currencyCode = 'INR',
): BalanceExplanationViewModel {
  return createBalanceExplanationViewModel({
    explanation,
    memberName,
    currencyCode,
  });
}

beforeEach(() => {
  mockRouterDismiss.mockClear();
});

// ---------------------------------------------------------------------------
// BalanceExplanationView
// ---------------------------------------------------------------------------

describe('BalanceExplanationView', () => {
  describe('creditor case', () => {
    it('renders the member name and "You are owed" badge', () => {
      const vm = makeViewModel(
        makeBalance({
          paidMinor: 1200,
          shareMinor: 300,
          netBalanceMinor: 900,
          summaryKey: 'creditor',
        }),
      );
      const { getByText, getByLabelText } = renderWithProviders(
        <BalanceExplanationView viewModel={vm} onClose={() => {}} />,
      );

      expect(getByText('Priya')).toBeTruthy();
      expect(getByText('You are owed')).toBeTruthy();
      // The net balance is shown via AmountText.
      expect(getByLabelText(/Net balance:/)).toBeTruthy();
    });

    it('renders the formula breakdown with paid / share / received / sent', () => {
      const vm = makeViewModel(
        makeBalance({
          paidMinor: 1200,
          shareMinor: 300,
          settlementsReceivedMinor: 200,
          settlementsSentMinor: 0,
          netBalanceMinor: 900,
          summaryKey: 'creditor',
        }),
      );
      const { getByText } = renderWithProviders(
        <BalanceExplanationView viewModel={vm} onClose={() => {}} />,
      );

      expect(getByText(/Paid: INR 12\.00/)).toBeTruthy();
      expect(getByText(/Priya's share: INR 3\.00/)).toBeTruthy();
      expect(getByText(/Received: INR 2\.00/)).toBeTruthy();
      expect(getByText(/Sent: INR 0\.00/)).toBeTruthy();
      expect(getByText(/Priya is owed: INR 9\.00/)).toBeTruthy();
    });
  });

  describe('debtor case', () => {
    it('renders the "You owe" badge and negative-balance summary', () => {
      const vm = makeViewModel(
        makeBalance({
          paidMinor: 0,
          shareMinor: 500,
          netBalanceMinor: -500,
          summaryKey: 'debtor',
        }),
        'Sam',
      );
      const { getByText } = renderWithProviders(
        <BalanceExplanationView viewModel={vm} onClose={() => {}} />,
      );

      expect(getByText('You owe')).toBeTruthy();
      expect(getByText(/Sam owes: INR 5\.00/)).toBeTruthy();
    });
  });

  describe('settled case', () => {
    it('renders the "Settled" badge and zero-balance summary', () => {
      const vm = makeViewModel(
        makeBalance({
          paidMinor: 300,
          shareMinor: 300,
          netBalanceMinor: 0,
          summaryKey: 'settled',
        }),
        'Pat',
      );
      const { getByText } = renderWithProviders(
        <BalanceExplanationView viewModel={vm} onClose={() => {}} />,
      );

      expect(getByText('Settled')).toBeTruthy();
      expect(getByText(/Pat is settled/)).toBeTruthy();
    });
  });

  describe('contributions', () => {
    it('renders a card per contribution with the title and net', () => {
      const vm = makeViewModel(
        makeBalance({
          paidMinor: 1000,
          shareMinor: 400,
          netBalanceMinor: 600,
          summaryKey: 'creditor',
          expenseContributions: [
            {
              expenseId: 'e_1',
              expenseTitle: 'Dinner',
              paidByMemberId: A,
              memberPaidMinor: 1000,
              memberShareMinor: 400,
              memberNetForExpenseMinor: 600,
              expenseDate: '2026-07-29',
            },
          ],
        }),
      );
      const { getByText, getAllByLabelText } = renderWithProviders(
        <BalanceExplanationView viewModel={vm} onClose={() => {}} />,
      );

      expect(getByText('Dinner')).toBeTruthy();
      expect(getByText('2026-07-29')).toBeTruthy();
      expect(getAllByLabelText('You paid: 1000 INR').length).toBeGreaterThan(0);
      expect(getAllByLabelText('Your share: 400 INR').length).toBeGreaterThan(0);
      expect(getAllByLabelText('Net contribution: 600 INR').length).toBeGreaterThan(0);
    });

    it('renders the empty-state card when there are no contributions', () => {
      const vm = makeViewModel(makeBalance());
      const { getByText } = renderWithProviders(
        <BalanceExplanationView viewModel={vm} onClose={() => {}} />,
      );

      expect(getByText('No expenses yet')).toBeTruthy();
    });
  });

  describe('settlement impacts', () => {
    it('renders a card per settlement with the direction label', () => {
      const vm = makeViewModel(
        makeBalance({
          settlementImpact: [
            {
              settlementId: 's_1',
              fromMemberId: A,
              toMemberId: B,
              amountMinor: 200,
              date: '2026-07-29',
              impactOnMember: 'reduced_debt',
            },
          ],
        }),
      );
      const { getByText } = renderWithProviders(
        <BalanceExplanationView viewModel={vm} onClose={() => {}} />,
      );

      expect(getByText('2026-07-29')).toBeTruthy();
      expect(getByText(/reduced your debt/)).toBeTruthy();
    });

    it('renders the empty-state card when there are no settlements', () => {
      const vm = makeViewModel(makeBalance());
      const { getByText } = renderWithProviders(
        <BalanceExplanationView viewModel={vm} onClose={() => {}} />,
      );

      expect(getByText('No settlements recorded')).toBeTruthy();
    });
  });

  describe('rounding notes', () => {
    it('renders a card per rounding note with the distribution method', () => {
      const vm = makeViewModel(
        makeBalance({
          roundingNotes: [
            {
              expenseId: 'e_1',
              totalAmountMinor: 1000,
              splitSumMinor: 999,
              remainderMinor: 1,
              distributionMethod: 'earliest_indices',
              membersReceivingExtra: [A],
            },
          ],
        }),
      );
      const { getByText } = renderWithProviders(
        <BalanceExplanationView viewModel={vm} onClose={() => {}} />,
      );

      expect(getByText('Rounding notes')).toBeTruthy();
      expect(getByText('Expense e_1')).toBeTruthy();
      expect(getByText('earliest_indices')).toBeTruthy();
      expect(getByText(/1 minor unit added/)).toBeTruthy();
    });

    it('hides the rounding-notes section when there are none', () => {
      const vm = makeViewModel(makeBalance());
      const { queryByText } = renderWithProviders(
        <BalanceExplanationView viewModel={vm} onClose={() => {}} />,
      );

      expect(queryByText('Rounding notes')).toBeNull();
    });
  });

  describe('close button', () => {
    it('invokes onClose when the Close button is pressed', () => {
      const onClose = jest.fn();
      const vm = makeViewModel(makeBalance());
      const { getByLabelText } = renderWithProviders(
        <BalanceExplanationView viewModel={vm} onClose={onClose} />,
      );

      fireEvent.press(getByLabelText('Close the balance explanation modal'));
      expect(onClose).toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// BalanceExplanationScreen (container)
// ---------------------------------------------------------------------------

describe('BalanceExplanationScreen (container)', () => {
  it('renders the empty-state view model when no explanation is provided', () => {
    const { getByText } = renderWithProviders(
      <BalanceExplanationScreen
        memberId="m_a"
        memberName="Priya"
        currencyCode="INR"
      />,
    );

    // Empty view model produces the "settled" badge and the empty-state
    // cards for contributions and settlements.
    expect(getByText('Settled')).toBeTruthy();
    expect(getByText('No expenses yet')).toBeTruthy();
    expect(getByText('No settlements recorded')).toBeTruthy();
  });

  it('renders the explanation view model when one is provided', () => {
    const explanation = makeBalance({
      paidMinor: 1200,
      shareMinor: 300,
      netBalanceMinor: 900,
      summaryKey: 'creditor',
    });
    const { getByText } = renderWithProviders(
      <BalanceExplanationScreen
        memberId="m_a"
        memberName="Priya"
        currencyCode="INR"
        explanation={explanation}
      />,
    );

    expect(getByText('Priya')).toBeTruthy();
    expect(getByText('You are owed')).toBeTruthy();
  });

  it('calls router.dismiss() when the Close button is pressed', () => {
    const explanation = makeBalance();
    const { getByLabelText } = renderWithProviders(
      <BalanceExplanationScreen
        memberId="m_a"
        memberName="Priya"
        currencyCode="INR"
        explanation={explanation}
      />,
    );

    fireEvent.press(getByLabelText('Close the balance explanation modal'));
    expect(mockRouterDismiss).toHaveBeenCalled();
  });

  it('uses the empty view model helper directly to produce all-zero state', () => {
    const vm = createEmptyBalanceExplanation('m_x', 'Test', 'USD');
    expect(vm.paidMinor).toBe(0);
    expect(vm.shareMinor).toBe(0);
    expect(vm.netBalanceMinor).toBe(0);
    expect(vm.summaryKey).toBe('settled');
  });
});
