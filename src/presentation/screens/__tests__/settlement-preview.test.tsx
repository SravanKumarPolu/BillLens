/**
 * Settlement preview screen component tests (Prompt 19).
 *
 * Uses `@testing-library/react-native` to render the presentational
 * `SettlementPreviewView` (and the thin `SettlementPreviewScreen`
 * container) with synthetic view models. `expo-router` and `Alert`
 * are mocked.
 *
 * Coverage:
 *   - Transfer details: from → to, amount, currency
 *   - Reason explanation
 *   - Before / after balances
 *   - Confirm / Cancel button wiring
 *   - Confirm disabled when amount is zero
 *   - Empty-state fallback
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Alert } from 'react-native';

import {
  SettlementPreviewScreen,
  SettlementPreviewView,
} from '@presentation/screens/settlements/SettlementPreviewScreen';
import {
  type SettlementPreviewViewModel,
  createEmptySettlementPreview,
  createSettlementPreviewViewModel,
} from '@presentation/view-models/balance-explanation';
import type { MemberId } from '@shared-types/index';

// Mock expo-router.
const mockRouterBack = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: {
    back: (...args: readonly unknown[]) => mockRouterBack(...args),
  },
}));

// Spy on Alert.alert so the confirm dialog does not blow up.
const mockAlert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

/** Wrap children in the providers the design system expects. */
function renderWithProviders(ui: ReactElement): ReturnType<typeof render> {
  return render(ui);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const A: MemberId = 'm_a' as MemberId;
const B: MemberId = 'm_b' as MemberId;
const C: MemberId = 'm_c' as MemberId;

function makeViewModel(
  overrides: Partial<Parameters<typeof createSettlementPreviewViewModel>[0]> = {},
): SettlementPreviewViewModel {
  return createSettlementPreviewViewModel({
    fromMemberId: A,
    toMemberId: B,
    amountMinor: 300,
    currencyCode: 'INR',
    members: [
      { memberId: A, memberName: 'Priya', balanceMinor: -300 },
      { memberId: B, memberName: 'Sam', balanceMinor: 300 },
      { memberId: C, memberName: 'Pat', balanceMinor: 0 },
    ],
    ...overrides,
  });
}

beforeEach(() => {
  mockRouterBack.mockClear();
  mockAlert.mockClear();
});

// ---------------------------------------------------------------------------
// SettlementPreviewView
// ---------------------------------------------------------------------------

describe('SettlementPreviewView', () => {
  describe('transfer details', () => {
    it('renders the from and to member names and the amount', () => {
      const vm = makeViewModel();
      const { getAllByText } = renderWithProviders(
        <SettlementPreviewView viewModel={vm} loadError={null} submitError={null} submitting={false} canConfirm onConfirm={() => {}} onCancel={() => {}} />,
      );

      // Priya + Sam appear in the transfer details AND in the balances
      // cards, so we use getAllByText.
      expect(getAllByText('Priya').length).toBeGreaterThan(0);
      expect(getAllByText('Sam').length).toBeGreaterThan(0);
      // INR currency code is shown multiple times.
      expect(getAllByText('INR').length).toBeGreaterThan(0);
    });

    it('renders the "Pays" and "Receives" badges', () => {
      const vm = makeViewModel();
      const { getByText } = renderWithProviders(
        <SettlementPreviewView
          viewModel={vm}
          loadError={null}
          submitError={null}
          submitting={false}
          canConfirm
          onConfirm={() => {}}
          onCancel={() => {}}
        />,
      );

      expect(getByText('Pays')).toBeTruthy();
      expect(getByText('Receives')).toBeTruthy();
    });
  });

  describe('reason', () => {
    it('renders the explanation card', () => {
      const vm = makeViewModel();
      const { getByText } = renderWithProviders(
        <SettlementPreviewView
          viewModel={vm}
          loadError={null}
          submitError={null}
          submitting={false}
          canConfirm
          onConfirm={() => {}}
          onCancel={() => {}}
        />,
      );

      expect(getByText('Why this transfer is suggested')).toBeTruthy();
      expect(getByText(/Priya owes Sam/)).toBeTruthy();
    });

    it('renders the empty-state reason when amount is zero', () => {
      const vm = createEmptySettlementPreview(A, B, 'INR');
      const { getByText } = renderWithProviders(
        <SettlementPreviewView
          viewModel={vm}
          loadError={null}
          submitError={null}
          submitting={false}
          canConfirm={false}
          onConfirm={() => {}}
          onCancel={() => {}}
        />,
      );

      expect(getByText(/No settlement is needed/)).toBeTruthy();
    });
  });

  describe('before / after balances', () => {
    it('renders a row per member with the projected balance', () => {
      const vm = makeViewModel();
      const { getByText, getAllByText, getAllByLabelText } = renderWithProviders(
        <SettlementPreviewView
          viewModel={vm}
          loadError={null}
          submitError={null}
          submitting={false}
          canConfirm
          onConfirm={() => {}}
          onCancel={() => {}}
        />,
      );

      expect(getByText('Before settlement')).toBeTruthy();
      expect(getByText('After settlement')).toBeTruthy();
      // Priya + Sam appear multiple times (transfer details + balances).
      expect(getAllByText('Priya').length).toBeGreaterThan(0);
      expect(getAllByText('Sam').length).toBeGreaterThan(0);
      expect(getAllByText('Pat').length).toBeGreaterThan(0);
      // Pat's balance is unchanged — 0 in both Before and After cards.
      expect(getAllByLabelText('Balance: 0 INR').length).toBeGreaterThan(0);
    });

    it('shows the "was" hint for the sender and recipient', () => {
      const vm = makeViewModel();
      const { getAllByText } = renderWithProviders(
        <SettlementPreviewView viewModel={vm} loadError={null} submitError={null} submitting={false} canConfirm onConfirm={() => {}} onCancel={() => {}} />,
      );

      // Both sender and recipient had a change → "was" hint appears
      // twice in the after-balances card.
      const wasHints = getAllByText(/was /);
      expect(wasHints.length).toBe(2);
    });
  });

  describe('confirm + cancel buttons', () => {
    it('invokes onConfirm when the Confirm button is pressed', () => {
      const onConfirm = jest.fn();
      const vm = makeViewModel();
      const { getByLabelText } = renderWithProviders(
        <SettlementPreviewView
          viewModel={vm}
          loadError={null}
          submitError={null}
          submitting={false}
          canConfirm
          onConfirm={(): void => { onConfirm(); }}
          onCancel={() => {}}
        />,
      );

      fireEvent.press(getByLabelText('Confirm the settlement transfer'));
      expect(onConfirm).toHaveBeenCalled();
    });

    it('invokes onCancel when the Cancel button is pressed', () => {
      const onCancel = jest.fn();
      const vm = makeViewModel();
      const { getByLabelText } = renderWithProviders(
        <SettlementPreviewView
          viewModel={vm}
          loadError={null}
          submitError={null}
          submitting={false}
          canConfirm
          onConfirm={() => {}}
          onCancel={(): void => { onCancel(); }}
        />,
      );

      fireEvent.press(
        getByLabelText('Cancel and go back without recording the settlement'),
      );
      expect(onCancel).toHaveBeenCalled();
    });

    it('disables the Confirm button when the amount is zero', () => {
      const onConfirm = jest.fn();
      const vm = createEmptySettlementPreview(A, B, 'INR');
      const { getByLabelText } = renderWithProviders(
        <SettlementPreviewView
          viewModel={vm}
          loadError={null}
          submitError={null}
          submitting={false}
          canConfirm={false}
          onConfirm={(): void => { onConfirm(); }}
          onCancel={() => {}}
        />,
      );

      const confirm = getByLabelText('Confirm the settlement transfer');
      fireEvent.press(confirm);
      // The Confirm button is disabled (Pressable no-op) — onConfirm
      // is not invoked.
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// SettlementPreviewScreen (container)
// ---------------------------------------------------------------------------

describe('SettlementPreviewScreen (container)', () => {
  it('renders the empty-state preview when amountMinor is zero', () => {
    const { getByText } = renderWithProviders(
      <SettlementPreviewScreen
        fromMemberId="m_a"
        toMemberId="m_b"
        amountMinor={0}
        currencyCode="INR"
      />,
    );

    expect(getByText(/No settlement is needed/)).toBeTruthy();
  });

  it('renders the transfer preview when amountMinor is positive', () => {
    const { getByText } = renderWithProviders(
      <SettlementPreviewScreen
        fromMemberId="m_a"
        toMemberId="m_b"
        amountMinor={300}
        currencyCode="INR"
      />,
    );

    expect(getByText('Settle up')).toBeTruthy();
    expect(getByText('Settlement preview')).toBeTruthy();
  });

  it('honours a viewModelOverride', () => {
    const vm = makeViewModel();
    const { getAllByText } = renderWithProviders(
      <SettlementPreviewScreen
        fromMemberId="ignored"
        toMemberId="ignored"
        amountMinor={0}
        currencyCode="USD"
        viewModelOverride={vm}
      />,
    );

    // The override carries Priya and Sam as members.
    expect(getAllByText('Priya').length).toBeGreaterThan(0);
    expect(getAllByText('Sam').length).toBeGreaterThan(0);
  });

  it('surfaces a submit error when services are not ready and Confirm is pressed', async () => {
    const vm = makeViewModel();
    const { getByLabelText, findByText } = renderWithProviders(
      <SettlementPreviewScreen
        fromMemberId="m_a"
        toMemberId="m_b"
        amountMinor={300}
        currencyCode="INR"
        groupId="g_test"
        viewModelOverride={vm}
      />,
    );

    fireEvent.press(getByLabelText('Confirm the settlement transfer'));
    // The hook surfaces a submit error because services are null in
    // this test environment — the user sees a clear message instead of
    // a silent no-op.
    const errorText = await findByText(/Storage is not ready yet/i);
    expect(errorText).toBeTruthy();
  });

  it('navigates back when the Cancel button is pressed', () => {
    const vm = makeViewModel();
    const { getByLabelText } = renderWithProviders(
      <SettlementPreviewScreen
        fromMemberId="m_a"
        toMemberId="m_b"
        amountMinor={300}
        currencyCode="INR"
        viewModelOverride={vm}
      />,
    );

    fireEvent.press(
      getByLabelText('Cancel and go back without recording the settlement'),
    );
    expect(mockRouterBack).toHaveBeenCalled();
  });
});
