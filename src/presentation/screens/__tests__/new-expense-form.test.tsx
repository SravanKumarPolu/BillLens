/**
 * NewExpenseScreen component tests — the manual expense form's pure view.
 *
 * Renders `NewExpenseView` (the presentational half) with constructed
 * view models and spy callbacks. The container's service interaction is
 * covered by the use-case tests over the real SQLite adapters
 * (`create-expense-manually.usecase.test.ts`) — here we verify the UI
 * contract: fields render, validation surfaces, the split preview is
 * visible, and submit is gated on validity.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import { NewExpenseView } from '@presentation/screens/expense/NewExpenseScreen';
import {
  type ExpenseFormMember,
  type ManualExpenseFormState,
  createManualExpenseFormViewModel,
  todayDateOnly,
} from '@presentation/view-models/expense-form';

const mockRouterBack = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: {
    back: () => mockRouterBack(),
    push: () => undefined,
    replace: () => undefined,
  },
}));

const MEMBERS: readonly ExpenseFormMember[] = [
  { id: 'm-alice', displayName: 'Alice' },
  { id: 'm-bob', displayName: 'Bob' },
  { id: 'm-carol', displayName: 'Carol' },
];

function makeState(overrides?: Partial<ManualExpenseFormState>): ManualExpenseFormState {
  return {
    title: 'Dinner',
    amountInput: '42.50',
    currencyCode: 'INR',
    dateInput: todayDateOnly(new Date(Date.UTC(2026, 9, 5))),
    note: '',
    payerMemberId: 'm-alice',
    participantIds: ['m-alice', 'm-bob'],
    ...overrides,
  };
}

function makeCallbacks() {
  return {
    onTitleChange: jest.fn(),
    onAmountChange: jest.fn(),
    onCurrencyChange: jest.fn(),
    onDateChange: jest.fn(),
    onNoteChange: jest.fn(),
    onPayerChange: jest.fn(),
    onToggleParticipant: jest.fn(),
    onSelectAllParticipants: jest.fn(),
    onSubmit: jest.fn(),
    onCancel: jest.fn(),
  };
}

function renderView(state: ManualExpenseFormState, callbacks = makeCallbacks()) {
  const viewModel = createManualExpenseFormViewModel({
    state,
    members: MEMBERS,
    defaultCurrencyCode: 'INR',
  });
  const result = render(
    <NewExpenseView
      viewModel={viewModel}
      groupName="Goa Trip"
      members={MEMBERS}
      fieldValues={state}
      submitError={null}
      isSubmitting={false}
      {...callbacks}
    />,
  );
  return { ...result, callbacks, viewModel };
}

beforeEach(() => {
  mockRouterBack.mockClear();
  jest.clearAllMocks();
});

describe('NewExpenseView', () => {
  it('renders the header, every field, and the member pickers', () => {
    const { getByText, getByLabelText } = renderView(makeState());

    expect(getByText('New expense')).toBeTruthy();
    expect(getByText('Add an expense to Goa Trip without scanning a receipt.')).toBeTruthy();
    expect(getByLabelText('Expense title')).toBeTruthy();
    expect(getByLabelText('Expense amount')).toBeTruthy();
    expect(getByLabelText('Expense date')).toBeTruthy();
    expect(getByLabelText('Expense note')).toBeTruthy();
    expect(getByLabelText('Alice paid this expense')).toBeTruthy();
    expect(getByLabelText('Include Bob in the split')).toBeTruthy();
    expect(getByLabelText('Include Carol in the split')).toBeTruthy();
  });

  it('shows the equal-split preview with per-person amounts', () => {
    const { getByText, getAllByText } = renderView(makeState());
    // 42.50 INR = 4250 minor → 2125 / 2125 (Alice appears in the payer
    // row, the participant row, AND the preview — assert multiples).
    expect(getByText('Split preview (equal)')).toBeTruthy();
    expect(getAllByText('Alice').length).toBeGreaterThanOrEqual(3);
    expect(getAllByText('Bob').length).toBeGreaterThanOrEqual(2);
  });

  it('enables submit only when the form is valid', () => {
    const invalid = renderView(makeState({ title: '' }));
    const submitInvalid = invalid.getByLabelText('Save this expense to the group');
    expect(submitInvalid.props.accessibilityState.disabled).toBe(true);

    const valid = renderView(makeState());
    const submitValid = valid.getByLabelText('Save this expense to the group');
    expect(submitValid.props.accessibilityState.disabled).toBe(false);
  });

  it('shows targeted field errors for an invalid form', () => {
    const { getByText } = renderView(
      makeState({
        title: '   ',
        amountInput: '1,000',
        dateInput: '2026-02-30',
        payerMemberId: null,
        participantIds: [],
      }),
    );
    expect(getByText('What was this expense for? Add a title.')).toBeTruthy();
    expect(getByText('Enter a valid amount, like 42.50.')).toBeTruthy();
    expect(getByText('Use a valid date (YYYY-MM-DD).')).toBeTruthy();
    expect(getByText('Choose who paid this expense.')).toBeTruthy();
    expect(getByText('Choose at least one person to split with.')).toBeTruthy();
  });

  it('typing into the title invokes onTitleChange', () => {
    const { getByLabelText, callbacks } = renderView(makeState());
    fireEvent.changeText(getByLabelText('Expense title'), 'Lunch');
    expect(callbacks.onTitleChange).toHaveBeenCalledWith('Lunch');
  });

  it('tapping a participant row invokes onToggleParticipant', () => {
    const { getByLabelText, callbacks } = renderView(makeState());
    fireEvent.press(getByLabelText('Include Carol in the split'));
    expect(callbacks.onToggleParticipant).toHaveBeenCalledWith('m-carol');
  });

  it('tapping a payer row invokes onPayerChange', () => {
    const { getByLabelText, callbacks } = renderView(makeState());
    fireEvent.press(getByLabelText('Bob paid this expense'));
    expect(callbacks.onPayerChange).toHaveBeenCalledWith('m-bob');
  });

  it('pressing Save invokes onSubmit (view model gates validity)', () => {
    const { getByLabelText, callbacks } = renderView(makeState());
    fireEvent.press(getByLabelText('Save this expense to the group'));
    expect(callbacks.onSubmit).toHaveBeenCalledTimes(1);
  });

  it('pressing Cancel invokes onCancel', () => {
    const { getByLabelText, callbacks } = renderView(makeState());
    fireEvent.press(getByLabelText('Cancel and discard this expense'));
    expect(callbacks.onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders the submit error banner when the save failed', () => {
    const state = makeState();
    const viewModel = createManualExpenseFormViewModel({
      state,
      members: MEMBERS,
      defaultCurrencyCode: 'INR',
    });
    const { getByText } = render(
      <NewExpenseView
        viewModel={viewModel}
        groupName="Goa Trip"
        members={MEMBERS}
        fieldValues={state}
        submitError="Payer contributions (900) must equal the expense total (1000)"
        isSubmitting={false}
        {...makeCallbacks()}
      />,
    );
    expect(getByText('Could not save the expense')).toBeTruthy();
    expect(
      getByText('Payer contributions (900) must equal the expense total (1000)'),
    ).toBeTruthy();
  });

  it('hides the split preview while the amount is unparseable', () => {
    const { queryByText } = renderView(makeState({ amountInput: '' }));
    expect(queryByText('Split preview (equal)')).toBeNull();
  });
});
