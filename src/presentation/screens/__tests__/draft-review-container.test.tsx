/**
 * DraftReviewScreen container regression tests (v2.26.0).
 *
 * Two production defects are pinned here, both found by the 2026-10-23
 * source audit:
 *
 *  1. The confirm flow NEVER persisted a Receipt row in production —
 *     `sourceImageUri` was a test-only prop and the route passed
 *     nothing, so the capture image was neither shown nor linked to
 *     the saved expense. The container now resolves the image URI from
 *     the draft's CaptureSource.
 *  2. A groupless draft (captured from the home FAB) could never be
 *     confirmed — the review screen had no group picker while the
 *     confirm handler demanded a group. The screen now offers an
 *     in-place group selection.
 *
 * These tests run the REAL container over an in-memory composition
 * root (same pattern as use-group-pending-confirmations tests).
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { createGroup } from '@domain/entities/group';
import { createGroupMember } from '@domain/entities/group-member';
import { createExpenseDraft, startProcessing, completeProcessing } from '@domain/entities/expense-draft';
import { createCaptureSource } from '@domain/entities/capture-source';
import { InMemoryDatabase } from '@infrastructure/__tests__/in-memory-database';
import type { AppServices } from '@infrastructure/composition-root';
import { createCompositionRoot } from '@infrastructure/composition-root';
import { runMigrations } from '@infrastructure/sqlite/schema';
import { DraftReviewScreen } from '@presentation/screens/drafts/DraftReviewScreen';
import { useDraftStore } from '@store/draft-store';
import { useGroupStore } from '@store/group-store';
import { resetAppServices, setAppServicesForTesting } from '@store/services-registry';

jest.mock('expo-router', () => ({
  __esModule: true,
  default: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    dismiss: jest.fn(),
    canGoBack: () => true,
  },
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    dismiss: jest.fn(),
    canGoBack: () => true,
  },
  useFocusEffect: (cb: () => () => void) => cb,
  useLocalSearchParams: () => ({}),
}));

const GROUP = 'g_review_test';
const OTHER_GROUP = 'g_other_test';
const MEMBER_A = 'm_rev_a';
const MEMBER_B = 'm_rev_b';
const USER = 'local-user';
const IMAGE_URI = 'file:///tmp/review-receipt.jpg';
const NOW = '2026-10-23T09:00:00.000Z' as never;

async function makeInMemoryServices(): Promise<AppServices> {
  const db = new InMemoryDatabase();
  await runMigrations(db);
  return createCompositionRoot({ database: db });
}

async function seedGroup(services: AppServices, groupId: string): Promise<void> {
  await services.repositories.groups.save(
    createGroup({
      id: groupId as never,
      name: `Group ${groupId}`,
      currencyCode: 'INR',
      createdBy: USER as never,
      now: NOW,
    }),
  );
  for (const [id, name, role] of [
    [MEMBER_A, 'Asha', 'owner'],
    [MEMBER_B, 'Bilal', 'member'],
  ] as const) {
    await services.repositories.members.save(
      createGroupMember({
        id: id as never,
        groupId: groupId as never,
        displayName: name,
        role: role as never,
        now: NOW,
      }),
    );
  }
}

function makeReviewableDraft(groupId?: string) {
  let draft = createExpenseDraft({
    id: 'd_review_1' as never,
    ...(groupId !== undefined ? { groupId: groupId as never } : {}),
    source: 'receipt',
    title: 'Dinner',
    amountMinor: 10_000,
    currencyCode: 'INR',
    merchantName: 'Udupi',
    expenseDate: '2026-10-20',
    payerCandidates: [MEMBER_A as never],
    participantCandidates: [MEMBER_A as never, MEMBER_B as never],
    // Items + charges sum to the total (2×3000 + 3000 + 1000 tax), so
    // `isTotalMismatch` is false and Confirm is enabled once a group is
    // linked.
    lineItems: [
      {
        id: 'di_r1' as never,
        name: 'Dosa',
        quantity: 2,
        unitPriceMinor: 3_000,
        totalAmountMinor: 6_000,
        assignedMemberIds: [MEMBER_A as never, MEMBER_B as never],
        confidence: 0.95,
        needsReview: false,
      },
      {
        id: 'di_r2' as never,
        name: 'Coffee',
        quantity: 1,
        unitPriceMinor: 3_000,
        totalAmountMinor: 3_000,
        assignedMemberIds: [MEMBER_B as never],
        confidence: 0.95,
        needsReview: false,
      },
    ],
    charges: [{ id: 'dc_r1' as never, type: 'tax', amountMinor: 1_000, confidence: 0.95, needsReview: false }],
    createdBy: USER as never,
    now: NOW,
  });
  draft = startProcessing(draft, { expectedVersion: draft.version } as never);
  draft = completeProcessing(draft, { expectedVersion: draft.version } as never);
  return draft;
}

describe('DraftReviewScreen (container, in-memory services)', () => {
  let services: AppServices;

  beforeEach(async () => {
    services = await makeInMemoryServices();
    await seedGroup(services, GROUP);
    await seedGroup(services, OTHER_GROUP);
    useDraftStore.getState().reset();
    useGroupStore.getState().reset();
    // Seed the UI group store so the groupless-draft picker has entries.
    useGroupStore.getState().addGroup({
      id: GROUP,
      name: 'Group g_review_test',
      currencyCode: 'INR',
      memberCount: 2,
      userBalanceMinor: 0,
      lastActivityLabel: 'Just now',
      archived: false,
      syncState: 'pending',
      groupType: 'Trip',
      privacyDefault: 'local_only',
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  afterEach(() => {
    resetAppServices();
  });

  it('shows the resolved capture image and persists the Receipt row on confirm', async () => {
    const draft = makeReviewableDraft(GROUP);
    const captureSource = createCaptureSource({
      id: 'cs_review_1' as never,
      sourceType: 'paper_receipt',
      imageUri: IMAGE_URI,
      capturedBy: USER as never,
      now: NOW,
    });
    await services.capture.repositories.captureSources.save({
      ...captureSource,
      processingStatus: 'processed',
    } as never);
    await services.repositories.drafts.save({ ...draft, captureSourceId: 'cs_review_1' as never });
    setAppServicesForTesting(services);

    const { getByLabelText } = render(<DraftReviewScreen draftId="d_review_1" />);

    // 1. The source image preview is resolved from the CaptureSource
    //    (previously production never showed it — test-only prop).
    await waitFor(() => {
      expect(getByLabelText('Receipt source image preview')).toBeTruthy();
    });

    // 2. Confirm creates the expense AND the linked receipt row. The
    //    receipt id is deterministic (`receipt-<draftId>`), so assert on
    //    it directly, plus the draft's terminal status.
    fireEvent.press(getByLabelText('Confirm the draft and create the expense'));
    await waitFor(async () => {
      const receipt = await services.repositories.receipts.findById('receipt-d_review_1' as never);
      expect(receipt).not.toBeNull();
      expect(receipt!.imageUri).toBe(IMAGE_URI);
      const draftAfter = await services.repositories.drafts.findById('d_review_1' as never);
      expect(draftAfter?.status).toBe('confirmed');
    });
  });

  it('offers an in-screen group picker for a groupless draft and blocks confirm until a group is selected', async () => {
    const draft = makeReviewableDraft(undefined);
    await services.repositories.drafts.save(draft);
    setAppServicesForTesting(services);

    const { getByLabelText, getByText, queryByLabelText } = render(
      <DraftReviewScreen draftId="d_review_1" />,
    );

    await waitFor(() => {
      expect(getByText('Select a group')).toBeTruthy();
    });

    // Confirm is disabled with the groupless hint, not the generic one.
    const confirm = getByLabelText(/Confirm is disabled/);
    expect(confirm).toBeTruthy();
    expect(getByText('Select a group first')).toBeTruthy();

    // Selecting a group enables the flow.
    fireEvent.press(getByLabelText(`Link this receipt to group Group ${GROUP}`));
    await waitFor(() => {
      expect(queryByLabelText(/Confirm is disabled/)).toBeNull();
      expect(getByLabelText('Confirm the draft and create the expense')).toBeTruthy();
    });
  });
});
