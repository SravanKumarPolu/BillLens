/**
 * Draft-review view-model unit tests (Prompt 18).
 *
 * Covers the pure projection / confidence-bucketing / blocking-issue
 * logic in `src/presentation/view-models/draft-review.ts`:
 *   - Confidence bucketing (high / medium / low / unknown)
 *   - Confidence label / requiresReview helpers
 *   - Charge-type labels
 *   - Severity → blocking mapping
 *   - Subtotal computation + total mismatch detection
 *   - canConfirm gating (missing total, blocking issues, missing payer,
 *     missing participants)
 *   - Edited-field tracking
 *
 * Pure logic — no rendering, no React, no stores.
 */

import { describe, expect, it } from '@jest/globals';

import {
  asDraftChargeId,
  asDraftLineItemId,
  asExpenseDraftId,
  asGroupId,
  asMemberId,
  asUserId,
  createDraftCharge,
  createDraftLineItem,
  createExpenseDraft,
  createFieldReviewIssue,
  asFieldReviewIssueId,
  type ExpenseDraft,
  type DraftCharge,
  type DraftLineItem,
} from '@domain/entities';
import { asDateTime } from '@domain/value-objects';
import {
  bucketConfidence,
  chargeTypeLabel,
  computeDraftSubtotal,
  confidenceLevelLabel,
  createDraftReviewViewModel,
  isBlockingSeverity,
  isTotalMismatch,
  issueSeverityBadge,
  issueSeverityLabel,
  issueTypeIcon,
  requiresReview,
} from '@presentation/view-models/draft-review';

// ---------------------------------------------------------------------------
// Helpers — build a draft for tests.
// ---------------------------------------------------------------------------

const NOW = asDateTime('2026-07-29T10:00:00.000Z');
const USER_ID = asUserId('user-1');
const MEMBER_A = asMemberId('m_a');
const MEMBER_B = asMemberId('m_b');

function makeLineItem(overrides: Partial<Parameters<typeof createDraftLineItem>[0]> = {}): DraftLineItem {
  return createDraftLineItem({
    id: asDraftLineItemId('li_1'),
    name: 'Burger',
    quantity: 1,
    unitPriceMinor: 500,
    assignedMemberIds: [MEMBER_A, MEMBER_B],
    ...overrides,
  });
}

function makeCharge(overrides: Partial<Parameters<typeof createDraftCharge>[0]> = {}): DraftCharge {
  return createDraftCharge({
    id: asDraftChargeId('ch_1'),
    type: 'tax',
    amountMinor: 50,
    ...overrides,
  });
}

function makeDraft(overrides: Partial<Parameters<typeof createExpenseDraft>[0]> = {}): ExpenseDraft {
  return createExpenseDraft({
    id: asExpenseDraftId('d_1'),
    source: 'receipt',
    title: 'Lunch',
    amountMinor: 550,
    currencyCode: 'USD',
    merchantName: 'Burger Joint',
    expenseDate: '2026-07-29',
    payerCandidates: [MEMBER_A],
    participantCandidates: [MEMBER_A, MEMBER_B],
    // v2.26.0: groupId is part of the base fixture — a draft without a
    // group now blocks confirmation (`missingGroup`) until the user
    // links one from the review screen.
    groupId: asGroupId('g_1'),
    lineItems: [makeLineItem()],
    charges: [makeCharge()],
    overallConfidence: 0.95,
    createdBy: USER_ID,
    now: NOW,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Confidence bucketing
// ---------------------------------------------------------------------------

describe('bucketConfidence', () => {
  it('returns "high" for confidence >= 0.85', () => {
    expect(bucketConfidence(0.85)).toBe('high');
    expect(bucketConfidence(1)).toBe('high');
  });

  it('returns "medium" for 0.60 ≤ confidence < 0.85', () => {
    expect(bucketConfidence(0.6)).toBe('medium');
    expect(bucketConfidence(0.84)).toBe('medium');
  });

  it('returns "low" for 0.30 ≤ confidence < 0.60', () => {
    expect(bucketConfidence(0.3)).toBe('low');
    expect(bucketConfidence(0.59)).toBe('low');
  });

  it('returns "unknown" for confidence < 0.30', () => {
    expect(bucketConfidence(0.29)).toBe('unknown');
    expect(bucketConfidence(0)).toBe('unknown');
  });

  it('returns "unknown" for undefined / non-finite', () => {
    expect(bucketConfidence(undefined)).toBe('unknown');
    expect(bucketConfidence(NaN)).toBe('unknown');
    expect(bucketConfidence(Infinity)).toBe('unknown');
  });
});

describe('confidenceLevelLabel', () => {
  it('returns a plain-language label for each level', () => {
    expect(confidenceLevelLabel('high')).toContain('High');
    expect(confidenceLevelLabel('medium')).toContain('Medium');
    expect(confidenceLevelLabel('low')).toContain('Low');
    expect(confidenceLevelLabel('unknown')).toContain('unknown');
  });

  it('always mentions review for medium / low / unknown', () => {
    expect(confidenceLevelLabel('medium')).toContain('review');
    expect(confidenceLevelLabel('low')).toContain('review');
    expect(confidenceLevelLabel('unknown')).toContain('review');
  });
});

describe('requiresReview', () => {
  it('returns false only for high confidence', () => {
    expect(requiresReview('high')).toBe(false);
    expect(requiresReview('medium')).toBe(true);
    expect(requiresReview('low')).toBe(true);
    expect(requiresReview('unknown')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Charge type labels
// ---------------------------------------------------------------------------

describe('chargeTypeLabel', () => {
  it('returns the human-readable label for known types', () => {
    expect(chargeTypeLabel('tax')).toBe('Tax');
    expect(chargeTypeLabel('service_charge')).toBe('Service charge');
    expect(chargeTypeLabel('tip')).toBe('Tip');
    expect(chargeTypeLabel('delivery')).toBe('Delivery');
    expect(chargeTypeLabel('discount')).toBe('Discount');
    expect(chargeTypeLabel('rounding_adjustment')).toBe('Rounding adjustment');
    expect(chargeTypeLabel('unassigned_amount')).toBe('Unassigned amount');
  });

  it('falls back to the raw type for unknown values', () => {
    expect(chargeTypeLabel('custom')).toBe('custom');
  });
});

// ---------------------------------------------------------------------------
// Issue severity → blocking mapping
// ---------------------------------------------------------------------------

describe('isBlockingSeverity', () => {
  it('returns true only for error severity', () => {
    expect(isBlockingSeverity('error')).toBe(true);
    expect(isBlockingSeverity('warning')).toBe(false);
    expect(isBlockingSeverity('info')).toBe(false);
  });
});

describe('issueSeverityLabel', () => {
  it('returns a plain-language label per severity', () => {
    expect(issueSeverityLabel('info')).toBe('Info');
    expect(issueSeverityLabel('warning')).toBe('Warning');
    expect(issueSeverityLabel('error')).toBe('Blocking issue');
  });
});

describe('issueSeverityBadge', () => {
  it('maps each severity to a badge variant', () => {
    expect(issueSeverityBadge('info')).toBe('info');
    expect(issueSeverityBadge('warning')).toBe('warning');
    expect(issueSeverityBadge('error')).toBe('negative');
  });
});

describe('issueTypeIcon', () => {
  it('returns an icon name per known issue type', () => {
    expect(typeof issueTypeIcon('low_confidence')).toBe('string');
    expect(typeof issueTypeIcon('total_mismatch')).toBe('string');
    expect(typeof issueTypeIcon('missing_field')).toBe('string');
    expect(typeof issueTypeIcon('duplicate_item')).toBe('string');
    expect(typeof issueTypeIcon('unassigned_items')).toBe('string');
    expect(typeof issueTypeIcon('currency_mismatch')).toBe('string');
    expect(typeof issueTypeIcon('date_in_future')).toBe('string');
    expect(typeof issueTypeIcon('amount_unreasonable')).toBe('string');
    expect(typeof issueTypeIcon('invalid_value')).toBe('string');
  });

  it('falls back to the info icon for unknown types', () => {
    expect(issueTypeIcon('unknown_type')).toBe('information-circle-outline');
  });
});

// ---------------------------------------------------------------------------
// Subtotal + total mismatch
// ---------------------------------------------------------------------------

describe('computeDraftSubtotal', () => {
  it('sums line items + charges', () => {
    const draft = makeDraft({
      lineItems: [
        makeLineItem({ id: asDraftLineItemId('li_1'), unitPriceMinor: 500, quantity: 2 }),
      ],
      charges: [makeCharge({ amountMinor: 50 }), makeCharge({ id: asDraftChargeId('ch_2'), type: 'tip', amountMinor: 100 })],
    });
    // 2 * 500 + 50 + 100 = 1150
    expect(computeDraftSubtotal(draft)).toBe(1150);
  });

  it('handles negative discounts / rounding adjustments', () => {
    const draft = makeDraft({
      lineItems: [makeLineItem({ unitPriceMinor: 500 })],
      charges: [
        makeCharge({ type: 'discount', amountMinor: -100 }),
        makeCharge({ id: asDraftChargeId('ch_2'), type: 'tax', amountMinor: 50 }),
      ],
    });
    // 500 - 100 + 50 = 450
    expect(computeDraftSubtotal(draft)).toBe(450);
  });

  it('returns 0 for an empty draft', () => {
    const draft = makeDraft({ lineItems: [], charges: [] });
    expect(computeDraftSubtotal(draft)).toBe(0);
  });
});

describe('isTotalMismatch', () => {
  it('returns false when subtotal matches amountMinor', () => {
    const draft = makeDraft({
      lineItems: [makeLineItem({ unitPriceMinor: 500 })],
      charges: [makeCharge({ amountMinor: 50 })],
      amountMinor: 550,
    });
    expect(isTotalMismatch(draft)).toBe(false);
  });

  it('returns true when subtotal differs from amountMinor', () => {
    const draft = makeDraft({
      lineItems: [makeLineItem({ unitPriceMinor: 500 })],
      charges: [makeCharge({ amountMinor: 50 })],
      amountMinor: 600, // mismatch: computed is 550
    });
    expect(isTotalMismatch(draft)).toBe(true);
  });

  it('returns true when amountMinor is missing', () => {
    const draft = makeDraft({
      lineItems: [makeLineItem({ unitPriceMinor: 500 })],
      charges: [],
      amountMinor: undefined,
    });
    expect(isTotalMismatch(draft)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createDraftReviewViewModel — full projection
// ---------------------------------------------------------------------------

describe('createDraftReviewViewModel', () => {
  describe('high-confidence complete receipt', () => {
    it('produces a view model where canConfirm is true', () => {
      const draft = makeDraft({
        overallConfidence: 0.95,
        lineItems: [makeLineItem({ confidence: 0.95 })],
        charges: [makeCharge({ confidence: 0.95 })],
      });
      const vm = createDraftReviewViewModel({ draft });

      expect(vm.draftId).toBe('d_1');
      expect(vm.canConfirm).toBe(true);
      expect(vm.blockingIssueCount).toBe(0);
      expect(vm.hasIssues).toBe(false);
      expect(vm.totalMismatch).toBe(false);
      expect(vm.hasUnassignedItems).toBe(false);
    });

    it('marks every field as high confidence', () => {
      const draft = makeDraft({ overallConfidence: 0.9 });
      const vm = createDraftReviewViewModel({ draft });

      expect(vm.totalConfidenceLevel).toBe('high');
      expect(vm.titleConfidence.level).toBe('high');
      expect(vm.merchantConfidence.level).toBe('high');
      expect(vm.dateConfidence.level).toBe('high');
      expect(vm.currencyConfidence.level).toBe('high');
    });
  });

  describe('missing total', () => {
    it('produces a blocking total mismatch and disables canConfirm', () => {
      const draft = makeDraft({
        amountMinor: undefined,
        lineItems: [makeLineItem({ unitPriceMinor: 500 })],
        charges: [],
      });
      const vm = createDraftReviewViewModel({ draft });

      expect(vm.totalMismatch).toBe(true);
      expect(vm.totalNeedsReview).toBe(true);
      expect(vm.canConfirm).toBe(false);
    });
  });

  describe('total mismatch', () => {
    it('flags the mismatch and disables canConfirm', () => {
      const draft = makeDraft({
        amountMinor: 600,
        lineItems: [makeLineItem({ unitPriceMinor: 500 })],
        charges: [makeCharge({ amountMinor: 50 })], // subtotal 550, total 600
      });
      const vm = createDraftReviewViewModel({ draft });

      expect(vm.totalMismatch).toBe(true);
      expect(vm.canConfirm).toBe(false);
    });
  });

  describe('low-confidence field', () => {
    it('is marked low with a "needs review" flag', () => {
      const draft = makeDraft({
        overallConfidence: 0.4,
        lineItems: [makeLineItem({ confidence: 0.4 })],
        charges: [],
      });
      const vm = createDraftReviewViewModel({ draft });

      expect(vm.totalConfidenceLevel).toBe('low');
      expect(vm.totalNeedsReview).toBe(true);
      expect(vm.lineItems[0]?.confidenceLevel).toBe('low');
      expect(vm.lineItems[0]?.needsReview).toBe(true);
    });

    it('renders the red StatusDot variant via the level', () => {
      const draft = makeDraft({ overallConfidence: 0.2 });
      const vm = createDraftReviewViewModel({ draft });

      expect(vm.totalConfidenceLevel).toBe('unknown');
      expect(confidenceLevelLabel(vm.totalConfidenceLevel)).toContain('unknown');
    });
  });

  describe('manually corrected field', () => {
    it('flips isEdited true for fields listed in editedFields', () => {
      const draft = makeDraft();
      const vm = createDraftReviewViewModel({
        draft,
        editedFields: new Set(['title']),
      });

      expect(vm.titleConfidence.isEdited).toBe(true);
      expect(vm.merchantConfidence.isEdited).toBe(false);
    });

    it('flips isEdited on a specific line item', () => {
      const draft = makeDraft({
        lineItems: [makeLineItem({ id: asDraftLineItemId('li_1') })],
      });
      const vm = createDraftReviewViewModel({
        draft,
        editedFields: new Set(['lineItems.li_1']),
      });

      expect(vm.lineItems[0]?.isEdited).toBe(true);
    });
  });

  describe('missing payer', () => {
    it('disables canConfirm when payerCandidates is empty', () => {
      const draft = makeDraft({ payerCandidates: [] });
      const vm = createDraftReviewViewModel({ draft });

      expect(vm.payerMemberId).toBeNull();
      expect(vm.canConfirm).toBe(false);
    });
  });

  describe('missing participants', () => {
    it('disables canConfirm when participantCandidates is empty', () => {
      const draft = makeDraft({ participantCandidates: [] });
      const vm = createDraftReviewViewModel({ draft });

      expect(vm.participantIds).toHaveLength(0);
      expect(vm.canConfirm).toBe(false);
    });
  });

  describe('unassigned line item', () => {
    it('flags hasUnassignedItems when an item has no assignments', () => {
      const draft = makeDraft({
        lineItems: [makeLineItem({ assignedMemberIds: [] })],
        // Add a corresponding blocking issue so canConfirm is gated.
        unresolvedIssues: [
          createFieldReviewIssue({
            id: asFieldReviewIssueId('i_1'),
            issueType: 'unassigned_items',
            severity: 'error',
            fieldName: 'lineItems',
            message: 'Line item has no assigned members',
          }),
        ],
      });
      const vm = createDraftReviewViewModel({ draft });

      expect(vm.hasUnassignedItems).toBe(true);
      expect(vm.blockingIssueCount).toBe(1);
      expect(vm.canConfirm).toBe(false);
    });
  });

  describe('issue projection', () => {
    it('maps every issue to the view model with blocking flag', () => {
      const draft = makeDraft({
        unresolvedIssues: [
          createFieldReviewIssue({
            id: asFieldReviewIssueId('i_info'),
            issueType: 'low_confidence',
            severity: 'info',
            fieldName: 'merchantName',
            message: 'Merchant name had low OCR confidence',
          }),
          createFieldReviewIssue({
            id: asFieldReviewIssueId('i_warn'),
            issueType: 'duplicate_item',
            severity: 'warning',
            fieldName: 'lineItems',
            message: 'Possible duplicate line item detected',
          }),
          createFieldReviewIssue({
            id: asFieldReviewIssueId('i_err'),
            issueType: 'total_mismatch',
            severity: 'error',
            fieldName: 'amountMinor',
            message: 'Items + charges do not equal the total',
            suggestedValue: 550,
          }),
        ],
      });
      const vm = createDraftReviewViewModel({ draft });

      expect(vm.issues).toHaveLength(3);
      expect(vm.blockingIssueCount).toBe(1);
      expect(vm.issues[0]?.severity).toBe('info');
      expect(vm.issues[0]?.isBlocking).toBe(false);
      expect(vm.issues[1]?.isBlocking).toBe(false);
      expect(vm.issues[2]?.isBlocking).toBe(true);
      expect(vm.issues[2]?.suggestedValueLabel).toBe('550');
    });
  });

  describe('edited persistence', () => {
    it('reflects the supplied splitMethod in the view model', () => {
      const draft = makeDraft();
      const vm = createDraftReviewViewModel({ draft, splitMethod: 'Items' });

      expect(vm.splitMethod).toBe('Items');
    });
  });

  describe('source / image flag', () => {
    it('sets hasImageSource when captureSourceId is present', () => {
      const draft = makeDraft({ captureSourceId: 'cs_1' as never });
      const vm = createDraftReviewViewModel({ draft });

      expect(vm.hasImageSource).toBe(true);
    });

    it('does not set hasImageSource for a manual draft', () => {
      const draft = makeDraft({ source: 'manual' });
      const vm = createDraftReviewViewModel({ draft });

      expect(vm.hasImageSource).toBe(false);
    });
  });

  describe('default currency fallback', () => {
    it('uses USD when currencyCode is missing', () => {
      const draft = makeDraft({ currencyCode: undefined });
      const vm = createDraftReviewViewModel({ draft });

      expect(vm.currencyCode).toBe('USD');
    });
  });
});
