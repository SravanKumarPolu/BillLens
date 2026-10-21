/**
 * Drafts inbox tests.
 *
 * Two layers, matching the rest of the presentation suite:
 *   1. View-model tests — pure filtering/sorting/labels.
 *   2. View tests — render `DraftsInboxView` with a synthetic view model.
 *
 * The inbox exists to close a dead end: drafts were persisted and
 * counted on the dashboard, but had no list route.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import {
  type ExpenseDraft,
  completeProcessing,
  createExpenseDraft,
  startProcessing,
} from '@domain/entities/expense-draft';
import { DraftsInboxView } from '@presentation/screens/drafts/DraftsInboxScreen';
import {
  createDraftsInboxViewModel,
  isInboxDraft,
} from '@presentation/view-models/drafts-inbox';

const NOW = new Date('2026-10-20T12:00:00.000Z');

function draftAt(status: 'needs_review' | 'ready' | 'confirmed', id: string): ExpenseDraft {
  let draft = createExpenseDraft({
    id: id as never,
    source: 'receipt',
    merchantName: `Merchant ${id}`,
    amountMinor: 123_450,
    currencyCode: 'INR',
    createdBy: 'local-user' as never,
    now: '2026-10-20T09:00:00.000Z' as never,
  });

  draft = startProcessing(draft, {
    expectedVersion: draft.version,
    now: '2026-10-20T09:30:00.000Z' as never,
  });
  draft = completeProcessing(draft, {
    expectedVersion: draft.version,
    now: '2026-10-20T10:00:00.000Z' as never,
  });
  return status === 'confirmed' ? { ...draft, status: 'confirmed' } : { ...draft, status };
}

describe('createDraftsInboxViewModel', () => {
  it('lists only actionable drafts', () => {
    const vm = createDraftsInboxViewModel(
      [draftAt('needs_review', 'a'), draftAt('ready', 'b'), draftAt('confirmed', 'c')],
      NOW,
    );
    expect(vm.rows.map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(vm.rows.some((r) => r.id === 'c')).toBe(false);
    expect(vm.isEmpty).toBe(false);
  });

  it('counts review vs ready separately', () => {
    const vm = createDraftsInboxViewModel(
      [draftAt('needs_review', 'a'), draftAt('needs_review', 'b'), draftAt('ready', 'c')],
      NOW,
    );
    expect(vm.reviewCount).toBe(2);
    expect(vm.readyCount).toBe(1);
    expect(vm.summary).toContain('3 drafts');
  });

  it('describes an empty inbox honestly', () => {
    const vm = createDraftsInboxViewModel([], NOW);
    expect(vm.isEmpty).toBe(true);
    expect(vm.rows).toEqual([]);
    expect(vm.summary).toContain('will appear here');
  });

  it('sorts newest first', () => {
    const older = {
      ...draftAt('needs_review', 'older'),
      updatedAt: '2026-10-19T10:00:00.000Z' as never,
    };
    const newer = {
      ...draftAt('needs_review', 'newer'),
      updatedAt: '2026-10-20T11:00:00.000Z' as never,
    };
    const vm = createDraftsInboxViewModel([older, newer], NOW);
    expect(vm.rows.map((r) => r.id)).toEqual(['newer', 'older']);
  });

  it('falls back to a neutral title when extraction captured no merchant', () => {
    const untitled = createExpenseDraft({
      id: 'u1' as never,
      source: 'payment_screenshot',
      createdBy: 'local-user' as never,
      now: '2026-10-20T09:00:00.000Z' as never,
    });
    const [row] = createDraftsInboxViewModel([{ ...untitled, status: 'needs_review' }], NOW)
      .rows;
    expect(row!.title).toBe('Untitled receipt');
    expect(row!.amountMinor).toBeNull();
    expect(row!.accessibilityLabel).toContain('amount not captured');
  });

  it('never reads raw minor units in the accessibility label', () => {
    const [row] = createDraftsInboxViewModel([draftAt('needs_review', 'a')], NOW).rows;
    expect(row!.accessibilityLabel).toContain('₹1,234.50 INR');
    expect(row!.accessibilityLabel).not.toContain('123450');
  });

  it('isInboxDraft rejects terminal statuses', () => {
    expect(isInboxDraft(draftAt('confirmed', 'c'))).toBe(false);
    expect(isInboxDraft(draftAt('ready', 'r'))).toBe(true);
  });
});

describe('DraftsInboxView', () => {
  it('renders a review action per draft', () => {
    const vm = createDraftsInboxViewModel([draftAt('needs_review', 'a')], NOW);
    const onOpenDraft = jest.fn();
    const { getByLabelText, getByText } = render(
      <DraftsInboxView viewModel={vm} onOpenDraft={onOpenDraft} />,
    );

    expect(getByText('Merchant a')).toBeTruthy();
    fireEvent.press(getByLabelText('Review draft Merchant a'));
    expect(onOpenDraft).toHaveBeenCalledWith('a');
  });

  it('shows the empty state instead of a blank list', () => {
    const vm = createDraftsInboxViewModel([], NOW);
    const { getByText } = render(<DraftsInboxView viewModel={vm} onOpenDraft={() => undefined} />);
    expect(getByText('Nothing waiting for review')).toBeTruthy();
  });

  it('shows a retry affordance on error', () => {
    const vm = createDraftsInboxViewModel([], NOW);
    const onRetry = jest.fn();
    const { getByLabelText, queryByText } = render(
      <DraftsInboxView
        viewModel={vm}
        error="Database unavailable"
        onRetry={onRetry}
        onOpenDraft={() => undefined}
      />,
    );

    expect(queryByText('Nothing waiting for review')).toBeNull();
    fireEvent.press(getByLabelText('Retry loading drafts'));
    expect(onRetry).toHaveBeenCalled();
  });
});
