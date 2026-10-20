/**
 * Draft review screen component tests (Prompt 18).
 *
 * Uses `@testing-library/react-native` to render the presentational
 * `DraftReviewView` (and the thin `DraftReviewScreen` container) with
 * synthetic view models. `expo-router` and `Alert` are mocked.
 *
 * Coverage:
 *   - High-confidence complete receipt: confirm enabled
 *   - Missing total: blocking issue, confirm disabled
 *   - Total mismatch: blocking issue, confirm disabled
 *   - Low-confidence field: red indicator + label
 *   - Manually corrected field: "Edited" badge
 *   - Issue card rendering + Resolve button
 *   - Discard button invokes onDiscard
 *   - Confirm button disabled state and label
 *   - Container renders empty state when no draft in store
 *   - Container persists field edits to the draft store
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Alert } from 'react-native';

import {
  asDraftChargeId,
  asDraftLineItemId,
  asExpenseDraftId,
  asMemberId,
  asUserId,
  createDraftCharge,
  createDraftLineItem,
  createExpenseDraft,
  createFieldReviewIssue,
  asFieldReviewIssueId,
  type ExpenseDraft,
} from '@domain/entities';
import { asDateTime } from '@domain/value-objects';
import { DraftReviewScreen, DraftReviewView } from '@presentation/screens/drafts/DraftReviewScreen';
import {
  type DraftReviewViewModel,
  createDraftReviewViewModel,
} from '@presentation/view-models/draft-review';
import { useDraftStore } from '@store/draft-store';

// Mock expo-router — only `mock`-prefixed variables may be referenced
// inside `jest.mock()` factory bodies.
const mockRouterBack = jest.fn();
const mockRouterDismiss = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: {
    back: (...args: readonly unknown[]) => mockRouterBack(...args),
    dismiss: (...args: readonly unknown[]) => mockRouterDismiss(...args),
  },
}));

// Mock Alert.alert so the discard confirmation dialog does not blow up
// in the jest environment. We spy on the real Alert module rather than
// mocking react-native wholesale (which breaks @testing-library).
const mockAlert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

/** Wrap children in the providers the design system expects. */
function renderWithProviders(ui: ReactElement): ReturnType<typeof render> {
  return render(ui);
}

// ---------------------------------------------------------------------------
// Helpers — build a draft + view model for tests.
// ---------------------------------------------------------------------------

const NOW = asDateTime('2026-07-29T10:00:00.000Z');
const USER_ID = asUserId('user-1');
const MEMBER_A = asMemberId('m_a');
const MEMBER_B = asMemberId('m_b');

function makeDraft(overrides: Partial<Parameters<typeof createExpenseDraft>[0]> = {}): ExpenseDraft {
  return createExpenseDraft({
    id: asExpenseDraftId('d_1'),
    source: 'receipt',
    captureSourceId: 'cs_1' as never,
    title: 'Lunch',
    amountMinor: 550,
    currencyCode: 'USD',
    merchantName: 'Burger Joint',
    expenseDate: '2026-07-29',
    payerCandidates: [MEMBER_A],
    participantCandidates: [MEMBER_A, MEMBER_B],
    lineItems: [
      createDraftLineItem({
        id: asDraftLineItemId('li_1'),
        name: 'Burger',
        quantity: 1,
        unitPriceMinor: 500,
        assignedMemberIds: [MEMBER_A, MEMBER_B],
        confidence: 0.95,
      }),
    ],
    charges: [createDraftCharge({ id: asDraftChargeId('ch_1'), type: 'tax', amountMinor: 50, confidence: 0.95 })],
    overallConfidence: 0.95,
    createdBy: USER_ID,
    now: NOW,
    ...overrides,
  });
}

function makeViewModel(
  draft: ExpenseDraft,
  editedFields?: Set<string>,
): DraftReviewViewModel {
  return createDraftReviewViewModel({ draft, editedFields });
}

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockRouterBack.mockClear();
  mockRouterDismiss.mockClear();
  mockAlert.mockClear();
  useDraftStore.getState().reset();
});

// ---------------------------------------------------------------------------
// DraftReviewView — presentational component
// ---------------------------------------------------------------------------

describe('DraftReviewView', () => {
  describe('high-confidence complete receipt', () => {
    it('enables the Confirm button when there are no blocking issues', () => {
      const vm = makeViewModel(makeDraft());
      const { getByLabelText, queryByText } = renderWithProviders(
        <DraftReviewView
          viewModel={vm}
          onTitleChange={() => {}}
          onMerchantChange={() => {}}
          onDateChange={() => {}}
          onCurrencyChange={() => {}}
          onSplitMethodChange={() => {}}
          onResolveIssue={() => {}}
          onDiscard={() => {}}
          onConfirm={() => {}}
        />,
      );

      const confirm = getByLabelText('Confirm the draft and create the expense');
      expect(confirm).toBeTruthy();
      // The "disabled until resolved" helper text should not appear.
      expect(queryByText(/disabled until every blocking issue/)).toBeNull();
    });

    it('shows the source image preview when hasImageSource is true', () => {
      const vm = makeViewModel(makeDraft());
      const { getByLabelText } = renderWithProviders(
        <DraftReviewView
          viewModel={vm}
          sourceImageUri="file://example.jpg"
          onTitleChange={() => {}}
          onMerchantChange={() => {}}
          onDateChange={() => {}}
          onCurrencyChange={() => {}}
          onSplitMethodChange={() => {}}
          onResolveIssue={() => {}}
          onDiscard={() => {}}
          onConfirm={() => {}}
        />,
      );

      expect(getByLabelText('Receipt source image preview')).toBeTruthy();
    });
  });

  describe('missing total', () => {
    it('disables Confirm and shows the mismatch warning', () => {
      const vm = makeViewModel(
        makeDraft({
          amountMinor: undefined,
          lineItems: [
            createDraftLineItem({
              id: asDraftLineItemId('li_1'),
              name: 'Burger',
              quantity: 1,
              unitPriceMinor: 500,
              assignedMemberIds: [MEMBER_A],
            }),
          ],
          charges: [],
        }),
      );
      const { getByLabelText, getByText } = renderWithProviders(
        <DraftReviewView
          viewModel={vm}
          onTitleChange={() => {}}
          onMerchantChange={() => {}}
          onDateChange={() => {}}
          onCurrencyChange={() => {}}
          onSplitMethodChange={() => {}}
          onResolveIssue={() => {}}
          onDiscard={() => {}}
          onConfirm={() => {}}
        />,
      );

      expect(getByText(/computed subtotal does not match the total/)).toBeTruthy();
      // The Confirm button should be disabled (label changes to the
      // "resolve blocking issues" form).
      expect(() => getByLabelText('Confirm the draft and create the expense')).toThrow();
    });
  });

  describe('total mismatch', () => {
    it('flags the mismatch and disables Confirm', () => {
      const vm = makeViewModel(
        makeDraft({
          amountMinor: 999,
          lineItems: [
            createDraftLineItem({
              id: asDraftLineItemId('li_1'),
              name: 'Burger',
              quantity: 1,
              unitPriceMinor: 500,
              assignedMemberIds: [MEMBER_A],
            }),
          ],
          charges: [createDraftCharge({ id: asDraftChargeId('ch_1'), type: 'tax', amountMinor: 50 })],
        }),
      );
      const { getByText } = renderWithProviders(
        <DraftReviewView
          viewModel={vm}
          onTitleChange={() => {}}
          onMerchantChange={() => {}}
          onDateChange={() => {}}
          onCurrencyChange={() => {}}
          onSplitMethodChange={() => {}}
          onResolveIssue={() => {}}
          onDiscard={() => {}}
          onConfirm={() => {}}
        />,
      );

      expect(getByText(/computed subtotal does not match the total/)).toBeTruthy();
    });
  });

  describe('low-confidence field', () => {
    it('shows the "Low confidence" label next to the dot', () => {
      const vm = makeViewModel(
        makeDraft({
          overallConfidence: 0.4,
          lineItems: [
            createDraftLineItem({
              id: asDraftLineItemId('li_1'),
              name: 'Burger',
              quantity: 1,
              unitPriceMinor: 500,
              assignedMemberIds: [MEMBER_A],
              confidence: 0.4,
            }),
          ],
          charges: [],
        }),
      );
      const { getAllByText } = renderWithProviders(
        <DraftReviewView
          viewModel={vm}
          onTitleChange={() => {}}
          onMerchantChange={() => {}}
          onDateChange={() => {}}
          onCurrencyChange={() => {}}
          onSplitMethodChange={() => {}}
          onResolveIssue={() => {}}
          onDiscard={() => {}}
          onConfirm={() => {}}
        />,
      );

      // At least one "Low confidence — review required" label renders.
      const lowLabels = getAllByText(/Low confidence/);
      expect(lowLabels.length).toBeGreaterThan(0);
    });
  });

  describe('manually corrected field', () => {
    it('shows the "Edited" badge next to the corrected field', () => {
      const vm = makeViewModel(makeDraft(), new Set(['title']));
      const { getAllByText } = renderWithProviders(
        <DraftReviewView
          viewModel={vm}
          onTitleChange={() => {}}
          onMerchantChange={() => {}}
          onDateChange={() => {}}
          onCurrencyChange={() => {}}
          onSplitMethodChange={() => {}}
          onResolveIssue={() => {}}
          onDiscard={() => {}}
          onConfirm={() => {}}
        />,
      );

      const editedBadges = getAllByText('Edited');
      expect(editedBadges.length).toBeGreaterThan(0);
    });
  });

  describe('issues', () => {
    it('renders a card per issue and a Resolve button', () => {
      const draft = makeDraft({
        unresolvedIssues: [
          createFieldReviewIssue({
            id: asFieldReviewIssueId('i_1'),
            issueType: 'low_confidence',
            severity: 'warning',
            fieldName: 'merchantName',
            message: 'Merchant OCR confidence is low.',
          }),
        ],
      });
      const vm = makeViewModel(draft);
      const { getByText, getByLabelText } = renderWithProviders(
        <DraftReviewView
          viewModel={vm}
          onTitleChange={() => {}}
          onMerchantChange={() => {}}
          onDateChange={() => {}}
          onCurrencyChange={() => {}}
          onSplitMethodChange={() => {}}
          onResolveIssue={() => {}}
          onDiscard={() => {}}
          onConfirm={() => {}}
        />,
      );

      expect(getByText('Issues to review')).toBeTruthy();
      expect(getByText('Merchant OCR confidence is low.')).toBeTruthy();
      expect(getByLabelText('Resolve issue: Merchant OCR confidence is low.')).toBeTruthy();
    });

    it('shows the blocking-issue count badge when blocking issues exist', () => {
      const draft = makeDraft({
        unresolvedIssues: [
          createFieldReviewIssue({
            id: asFieldReviewIssueId('i_1'),
            issueType: 'total_mismatch',
            severity: 'error',
            fieldName: 'amountMinor',
            message: 'Subtotal does not equal total.',
          }),
        ],
        amountMinor: 999,
        lineItems: [
          createDraftLineItem({
            id: asDraftLineItemId('li_1'),
            name: 'Burger',
            quantity: 1,
            unitPriceMinor: 500,
            assignedMemberIds: [MEMBER_A],
          }),
        ],
        charges: [createDraftCharge({ id: asDraftChargeId('ch_1'), type: 'tax', amountMinor: 50 })],
      });
      const vm = makeViewModel(draft);
      const { getByText } = renderWithProviders(
        <DraftReviewView
          viewModel={vm}
          onTitleChange={() => {}}
          onMerchantChange={() => {}}
          onDateChange={() => {}}
          onCurrencyChange={() => {}}
          onSplitMethodChange={() => {}}
          onResolveIssue={() => {}}
          onDiscard={() => {}}
          onConfirm={() => {}}
        />,
      );

      expect(getByText('1 blocking')).toBeTruthy();
    });
  });

  describe('callbacks', () => {
    it('invokes onTitleChange when the title input is edited', () => {
      const onTitleChange = jest.fn();
      const vm = makeViewModel(makeDraft());
      const { getByLabelText } = renderWithProviders(
        <DraftReviewView
          viewModel={vm}
          onTitleChange={onTitleChange}
          onMerchantChange={() => {}}
          onDateChange={() => {}}
          onCurrencyChange={() => {}}
          onSplitMethodChange={() => {}}
          onResolveIssue={() => {}}
          onDiscard={() => {}}
          onConfirm={() => {}}
        />,
      );

      fireEvent.changeText(getByLabelText('Edit the draft title'), 'Dinner');
      expect(onTitleChange).toHaveBeenCalledWith('Dinner');
    });

    it('invokes onConfirm when the Confirm button is pressed', () => {
      const onConfirm = jest.fn();
      const vm = makeViewModel(makeDraft());
      const { getByLabelText } = renderWithProviders(
        <DraftReviewView
          viewModel={vm}
          onTitleChange={() => {}}
          onMerchantChange={() => {}}
          onDateChange={() => {}}
          onCurrencyChange={() => {}}
          onSplitMethodChange={() => {}}
          onResolveIssue={() => {}}
          onDiscard={() => {}}
          onConfirm={onConfirm}
        />,
      );

      fireEvent.press(getByLabelText('Confirm the draft and create the expense'));
      expect(onConfirm).toHaveBeenCalled();
    });

    it('does not invoke onConfirm when the button is disabled', () => {
      const onConfirm = jest.fn();
      const vm = makeViewModel(
        makeDraft({
          unresolvedIssues: [
            createFieldReviewIssue({
              id: asFieldReviewIssueId('i_1'),
              issueType: 'total_mismatch',
              severity: 'error',
              fieldName: 'amountMinor',
              message: 'Subtotal does not equal total.',
            }),
          ],
          amountMinor: 999,
          lineItems: [
            createDraftLineItem({
              id: asDraftLineItemId('li_1'),
              name: 'Burger',
              quantity: 1,
              unitPriceMinor: 500,
              assignedMemberIds: [MEMBER_A],
            }),
          ],
          charges: [createDraftCharge({ id: asDraftChargeId('ch_1'), type: 'tax', amountMinor: 50 })],
        }),
      );
      const { getByLabelText } = renderWithProviders(
        <DraftReviewView
          viewModel={vm}
          onTitleChange={() => {}}
          onMerchantChange={() => {}}
          onDateChange={() => {}}
          onCurrencyChange={() => {}}
          onSplitMethodChange={() => {}}
          onResolveIssue={() => {}}
          onDiscard={() => {}}
          onConfirm={onConfirm}
        />,
      );

      // The disabled button uses a different accessibility label.
      const disabled = getByLabelText(
        /Confirm is disabled — 1 blocking issue must be resolved first/,
      );
      fireEvent.press(disabled);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('invokes onDiscard when the Discard button is pressed', () => {
      const onDiscard = jest.fn();
      const vm = makeViewModel(makeDraft());
      const { getByLabelText } = renderWithProviders(
        <DraftReviewView
          viewModel={vm}
          onTitleChange={() => {}}
          onMerchantChange={() => {}}
          onDateChange={() => {}}
          onCurrencyChange={() => {}}
          onSplitMethodChange={() => {}}
          onResolveIssue={() => {}}
          onDiscard={onDiscard}
          onConfirm={() => {}}
        />,
      );

      fireEvent.press(getByLabelText('Discard this draft (with confirmation)'));
      expect(onDiscard).toHaveBeenCalled();
    });

    it('invokes onSplitMethodChange when a pill is tapped', () => {
      const onSplitMethodChange = jest.fn();
      const vm = makeViewModel(makeDraft());
      const { getByLabelText } = renderWithProviders(
        <DraftReviewView
          viewModel={vm}
          onTitleChange={() => {}}
          onMerchantChange={() => {}}
          onDateChange={() => {}}
          onCurrencyChange={() => {}}
          onSplitMethodChange={onSplitMethodChange}
          onResolveIssue={() => {}}
          onDiscard={() => {}}
          onConfirm={() => {}}
        />,
      );

      fireEvent.press(getByLabelText('Select Items split method'));
      expect(onSplitMethodChange).toHaveBeenCalledWith('Items');
    });

    it('invokes onResolveIssue when an issue Resolve button is pressed', () => {
      const onResolveIssue = jest.fn();
      const draft = makeDraft({
        unresolvedIssues: [
          createFieldReviewIssue({
            id: asFieldReviewIssueId('i_1'),
            issueType: 'low_confidence',
            severity: 'info',
            fieldName: 'merchantName',
            message: 'Low confidence.',
          }),
        ],
      });
      const vm = makeViewModel(draft);
      const { getByLabelText } = renderWithProviders(
        <DraftReviewView
          viewModel={vm}
          onTitleChange={() => {}}
          onMerchantChange={() => {}}
          onDateChange={() => {}}
          onCurrencyChange={() => {}}
          onSplitMethodChange={() => {}}
          onResolveIssue={onResolveIssue}
          onDiscard={() => {}}
          onConfirm={() => {}}
        />,
      );

      fireEvent.press(getByLabelText('Resolve issue: Low confidence.'));
      expect(onResolveIssue).toHaveBeenCalled();
    });
  });

  describe('confidence labels are always present (never colour alone)', () => {
    it('renders a confidence label next to every StatusDot for fields', () => {
      const vm = makeViewModel(makeDraft());
      const { getAllByText } = renderWithProviders(
        <DraftReviewView
          viewModel={vm}
          onTitleChange={() => {}}
          onMerchantChange={() => {}}
          onDateChange={() => {}}
          onCurrencyChange={() => {}}
          onSplitMethodChange={() => {}}
          onResolveIssue={() => {}}
          onDiscard={() => {}}
          onConfirm={() => {}}
        />,
      );

      const highLabels = getAllByText(/High confidence/);
      expect(highLabels.length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// DraftReviewScreen — container
// ---------------------------------------------------------------------------

describe('DraftReviewScreen (container)', () => {
  it('renders the empty state when no draft is in the store', () => {
    const { getByText } = renderWithProviders(<DraftReviewScreen draftId="d_missing" />);

    expect(getByText('No draft loaded')).toBeTruthy();
  });

  it('renders the review UI when a draft is in the store', () => {
    const draft = makeDraft();
    useDraftStore.getState().setCurrentDraft(draft);
    const { getByLabelText } = renderWithProviders(<DraftReviewScreen draftId="d_1" />);

    expect(getByLabelText('Edit the draft title')).toBeTruthy();
  });

  it('persists title edits to the draft store', () => {
    const draft = makeDraft();
    useDraftStore.getState().setCurrentDraft(draft);
    const { getByLabelText } = renderWithProviders(<DraftReviewScreen draftId="d_1" />);

    fireEvent.changeText(getByLabelText('Edit the draft title'), 'Dinner');

    expect(useDraftStore.getState().currentDraft?.title).toBe('Dinner');
    expect(useDraftStore.getState().hasUnsavedChanges).toBe(true);
  });

  it('triggers the discard Alert when the Discard button is pressed', () => {
    const draft = makeDraft();
    useDraftStore.getState().setCurrentDraft(draft);
    const { getByLabelText } = renderWithProviders(<DraftReviewScreen draftId="d_1" />);

    fireEvent.press(getByLabelText('Discard this draft (with confirmation)'));
    expect(mockAlert).toHaveBeenCalledTimes(1);
  });
});
