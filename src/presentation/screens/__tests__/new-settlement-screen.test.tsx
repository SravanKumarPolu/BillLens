/**
 * NewSettlementScreen tests.
 *
 * Verifies the pure view component renders correctly for the
 * empty / loading / ready / error states, and that user interaction
 * (selecting members, entering amount, choosing method, pressing
 * submit) triggers the expected callbacks.
 *
 * The container is exercised in the integration tests via the
 * `use-settlement-form` and `use-group-members` hooks; here we focus
 * on the presentational layer.
 *
 * v2.4.0 Phase 3: also covers the overpayment warning card —
 * rendering for both warning reasons, the explicit-confirm flow
 * ("Record anyway" vs "Edit amount"), and integer-only amount
 * formatting inside the message (JPY 0-decimal safety).
 */

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import type { SettlementMethod } from '@domain/entities/settlement';
import type { SettlementOverpaymentWarning } from '@presentation/hooks/use-settlement-form';
import {
  buildSettlementViewModel,
  NewSettlementView,
  type NewSettlementViewModel,
} from '@presentation/screens/settlement/NewSettlementScreen';

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

function makeViewModel(
  overrides: Partial<Parameters<typeof buildSettlementViewModel>[0]> = {},
): ReturnType<typeof buildSettlementViewModel> {
  return buildSettlementViewModel(overrides);
}

interface HandlerOverrides {
  onSelectFrom?: (id: string) => void;
  onSelectTo?: (id: string) => void;
  onAmountChange?: (v: string) => void;
  onSelectMethod?: (m: SettlementMethod) => void;
  onNoteChange?: (v: string) => void;
  onSubmit?: () => void;
  onConfirmOverpayment?: () => void;
  onDismissOverpayment?: () => void;
  onCancel?: () => void;
}

function renderView(vm: NewSettlementViewModel, handlers: HandlerOverrides = {}): ReturnType<typeof render> {
  return render(
    <NewSettlementView
      viewModel={vm}
      onSelectFrom={handlers.onSelectFrom ?? (() => {})}
      onSelectTo={handlers.onSelectTo ?? (() => {})}
      onAmountChange={handlers.onAmountChange ?? (() => {})}
      onSelectMethod={handlers.onSelectMethod ?? (() => {})}
      onNoteChange={handlers.onNoteChange ?? (() => {})}
      onSubmit={handlers.onSubmit ?? (() => {})}
      onConfirmOverpayment={handlers.onConfirmOverpayment ?? (() => {})}
      onDismissOverpayment={handlers.onDismissOverpayment ?? (() => {})}
      onCancel={handlers.onCancel ?? (() => {})}
    />,
  );
}

const TWO_MEMBERS = [
  { id: 'm1', displayName: 'Alice', isCurrentUser: false },
  { id: 'm2', displayName: 'Bob', isCurrentUser: false },
];

describe('NewSettlementView', () => {
  it('renders the header with group name and currency', () => {
    const vm = makeViewModel({ groupName: 'Goa Trip', currencyCode: 'INR' });
    const { getByText } = renderView(vm);
    expect(getByText('Settle up')).toBeTruthy();
    expect(getByText('Goa Trip · INR')).toBeTruthy();
  });

  it('renders the empty-members hint when no members exist', () => {
    const vm = makeViewModel({ members: [], loading: false });
    const { getByText } = renderView(vm);
    expect(getByText(/Invite a member from the group settings first/)).toBeTruthy();
  });

  it('renders the loading state', () => {
    const vm = makeViewModel({ loading: true });
    const { getByText } = renderView(vm);
    expect(getByText(/Loading this group's members/)).toBeTruthy();
  });

  it('renders the load-error state', () => {
    const vm = makeViewModel({ loadError: 'Group not found' });
    const { getByText } = renderView(vm);
    expect(getByText('Could not load this group')).toBeTruthy();
    expect(getByText('Group not found')).toBeTruthy();
  });

  it('renders the submit error state', () => {
    const vm = makeViewModel({ error: 'Something broke' });
    const { getByText } = renderView(vm);
    expect(getByText('Could not record the settlement')).toBeTruthy();
    expect(getByText('Something broke')).toBeTruthy();
  });

  it('renders the same-member warning when payer == receiver', () => {
    const vm = makeViewModel({
      sameMemberSelected: true,
      members: TWO_MEMBERS,
      form: { fromMemberId: 'm1', toMemberId: 'm1', amountMajor: '10', currencyCode: 'USD', method: 'cash', note: '' },
    });
    const { getByText } = renderView(vm);
    expect(getByText('Payer and receiver cannot be the same member.')).toBeTruthy();
  });

  it('calls onSelectFrom when a member is tapped', () => {
    const handleSelectFrom = jest.fn();
    const vm = makeViewModel({ members: TWO_MEMBERS });
    const { getByLabelText } = renderView(vm, { onSelectFrom: handleSelectFrom });
    fireEvent.press(getByLabelText('Select Alice as payer'));
    expect(handleSelectFrom).toHaveBeenCalledWith('m1');
  });

  it('calls onSelectTo when a member is tapped (excluding the payer)', () => {
    const handleSelectTo = jest.fn();
    const vm = makeViewModel({
      members: TWO_MEMBERS,
      form: { fromMemberId: 'm1', toMemberId: '', amountMajor: '', currencyCode: 'USD', method: 'cash', note: '' },
    });
    const { getByLabelText } = renderView(vm, { onSelectTo: handleSelectTo });
    fireEvent.press(getByLabelText('Select Bob as receiver'));
    expect(handleSelectTo).toHaveBeenCalledWith('m2');
  });

  it('calls onSelectMethod when a method pill is tapped', () => {
    const handleSelectMethod = jest.fn<(m: SettlementMethod) => void>();
    const vm = makeViewModel();
    const { getByLabelText } = renderView(vm, {
      onSelectMethod: (m): void => {
        handleSelectMethod(m);
      },
    });
    fireEvent.press(getByLabelText('Select cash as payment method'));
    expect(handleSelectMethod).toHaveBeenCalledWith('cash');
  });

  it('disables submit when canSubmit is false', () => {
    const handleSubmit = jest.fn();
    const vm = makeViewModel({ canSubmit: false });
    const { getByLabelText } = renderView(vm, { onSubmit: (): void => { handleSubmit(); } });
    const submitButton = getByLabelText('Record this settlement');
    // Pressable's disabled state suppresses onPress.
    fireEvent.press(submitButton);
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit when canSubmit is true', () => {
    const handleSubmit = jest.fn();
    const vm = makeViewModel({
      canSubmit: true,
      members: TWO_MEMBERS,
      form: { fromMemberId: 'm1', toMemberId: 'm2', amountMajor: '50.00', currencyCode: 'USD', method: 'upi', note: '' },
    });
    const { getByLabelText } = renderView(vm, { onSubmit: (): void => { handleSubmit(); } });
    fireEvent.press(getByLabelText('Record this settlement'));
    expect(handleSubmit).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Cancel is pressed', () => {
    const handleCancel = jest.fn();
    const vm = makeViewModel();
    const { getByLabelText } = renderView(vm, { onCancel: (): void => { handleCancel(); } });
    fireEvent.press(getByLabelText('Cancel and go back'));
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Overpayment warning (Phase 3)
// ---------------------------------------------------------------------------

function makeWarning(
  overrides: Partial<SettlementOverpaymentWarning> = {},
): SettlementOverpaymentWarning {
  return {
    reason: 'exceeds_outstanding',
    amountMinor: 60000,
    outstandingMinor: 25000,
    currencyCode: 'USD',
    payerNetMinor: -25000,
    ...overrides,
  };
}

describe('NewSettlementView — overpayment warning', () => {
  it('renders nothing when there is no warning', () => {
    const vm = makeViewModel({ members: TWO_MEMBERS });
    const { queryByTestId } = renderView(vm);
    expect(queryByTestId('overpayment-warning')).toBeNull();
  });

  it('renders the exceeds_outstanding warning with amounts and payer name', () => {
    const vm = makeViewModel({
      members: TWO_MEMBERS,
      form: { fromMemberId: 'm2', toMemberId: 'm1', amountMajor: '600.00', currencyCode: 'USD', method: 'cash', note: '' },
      overpayment: makeWarning(),
    });
    const { getByTestId, getByText } = renderView(vm);
    expect(getByTestId('overpayment-warning')).toBeTruthy();
    // 60000 minor = USD 600.00; 25000 minor = USD 250.00 (integer-only).
    expect(getByText(/USD 600\.00/)).toBeTruthy();
    expect(getByText(/USD 250\.00/)).toBeTruthy();
    expect(getByText(/Bob owes/)).toBeTruthy();
  });

  it('renders the payer_is_owed warning with a distinct message', () => {
    const vm = makeViewModel({
      members: TWO_MEMBERS,
      form: { fromMemberId: 'm1', toMemberId: 'm2', amountMajor: '100.00', currencyCode: 'USD', method: 'cash', note: '' },
      overpayment: makeWarning({
        reason: 'payer_is_owed',
        amountMinor: 10000,
        outstandingMinor: 0,
        payerNetMinor: 25000,
      }),
    });
    const { getByTestId, getByText } = renderView(vm);
    expect(getByTestId('overpayment-warning')).toBeTruthy();
    expect(getByText(/Alice is currently owed money in this group/)).toBeTruthy();
    expect(getByText(/off-ledger reimbursement/)).toBeTruthy();
  });

  it('formats 0-decimal currencies without a decimal point (JPY)', () => {
    const vm = makeViewModel({
      members: TWO_MEMBERS,
      form: { fromMemberId: 'm2', toMemberId: 'm1', amountMajor: '6000', currencyCode: 'JPY', method: 'cash', note: '' },
      overpayment: makeWarning({
        currencyCode: 'JPY',
        amountMinor: 6000,
        outstandingMinor: 2500,
        payerNetMinor: -2500,
      }),
    });
    const { getByText } = renderView(vm);
    // 6000 JPY minor units = ¥6000 (no decimals — never ¥60.00).
    expect(getByText(/JPY 6000/)).toBeTruthy();
    expect(getByText(/JPY 2500/)).toBeTruthy();
  });

  it('calls onConfirmOverpayment when "Record anyway" is pressed', () => {
    const handleConfirm = jest.fn();
    const vm = makeViewModel({
      members: TWO_MEMBERS,
      form: { fromMemberId: 'm2', toMemberId: 'm1', amountMajor: '600.00', currencyCode: 'USD', method: 'cash', note: '' },
      overpayment: makeWarning(),
    });
    const { getByLabelText } = renderView(vm, {
      onConfirmOverpayment: (): void => {
        handleConfirm();
      },
    });
    fireEvent.press(getByLabelText('Record this payment despite the overpayment warning'));
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onDismissOverpayment when "Edit amount" is pressed', () => {
    const handleDismiss = jest.fn();
    const vm = makeViewModel({
      members: TWO_MEMBERS,
      form: { fromMemberId: 'm2', toMemberId: 'm1', amountMajor: '600.00', currencyCode: 'USD', method: 'cash', note: '' },
      overpayment: makeWarning(),
    });
    const { getByLabelText } = renderView(vm, {
      onDismissOverpayment: (): void => {
        handleDismiss();
      },
    });
    fireEvent.press(getByLabelText('Dismiss warning and edit the amount'));
    expect(handleDismiss).toHaveBeenCalledTimes(1);
  });
});
