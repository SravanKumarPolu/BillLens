/**
 * Drafts inbox view model.
 *
 * The dashboard tells the user "N drafts waiting for review", but the
 * only route into a draft is capturing another receipt. This view model
 * powers the missing inbox: every draft that is still editable
 * (`needs_review` or `ready`), newest first, with the information needed
 * to decide what to open.
 *
 * Pure: takes drafts + "now", returns display rows. No stores, no I/O,
 * so it is directly unit-testable and the screen stays presentational.
 */

import type { DraftSource, DraftStatus, ExpenseDraft } from '@domain/entities/expense-draft';
import { describeAmount } from '@presentation/design-system/financial-format';
import { formatRelativeTime } from '@presentation/utils/relative-time';

/** Only these statuses are actionable — the rest are terminal. */
export const INBOX_DRAFT_STATUSES: readonly DraftStatus[] = ['needs_review', 'ready'] as const;

export interface DraftInboxRowViewModel {
  readonly id: string;
  /** Merchant when known, else the draft title, else a neutral fallback. */
  readonly title: string;
  /** "2 hours ago · Needs review · Receipt". */
  readonly subtitle: string;
  readonly statusLabel: string;
  /** Drives the status dot colour in the view. */
  readonly statusTone: 'review' | 'ready';
  /** Minor units, or null when extraction never captured an amount. */
  readonly amountMinor: number | null;
  readonly currencyCode: string | null;
  readonly sourceLabel: string;
  readonly updatedLabel: string;
  /** Number of unresolved field issues (0 when clean). */
  readonly issueCount: number;
  readonly accessibilityLabel: string;
}

export interface DraftsInboxViewModel {
  readonly rows: readonly DraftInboxRowViewModel[];
  readonly reviewCount: number;
  readonly readyCount: number;
  readonly isEmpty: boolean;
  readonly headline: string;
  readonly summary: string;
}

const SOURCE_LABELS: Readonly<Record<DraftSource, string>> = {
  manual: 'Entered manually',
  receipt: 'Receipt',
  payment_screenshot: 'Payment screenshot',
  invoice: 'Invoice',
};

const STATUS_LABELS: Readonly<Record<'review' | 'ready', string>> = {
  review: 'Needs review',
  ready: 'Ready to confirm',
};

export function isInboxDraft(draft: ExpenseDraft): boolean {
  return INBOX_DRAFT_STATUSES.includes(draft.status);
}

function titleFor(draft: ExpenseDraft): string {
  const merchant = draft.merchantName?.trim() ?? '';
  if (merchant.length > 0) return merchant;
  const title = draft.title?.trim() ?? '';
  if (title.length > 0) return title;
  return 'Untitled receipt';
}

function toRow(draft: ExpenseDraft, now: Date): DraftInboxRowViewModel {
  const statusTone = draft.status === 'ready' ? 'ready' : 'review';
  const statusLabel = STATUS_LABELS[statusTone];
  const sourceLabel = SOURCE_LABELS[draft.source];
  const updatedLabel = formatRelativeTime(draft.updatedAt, now);
  const issueCount = draft.unresolvedIssues.length;
  const title = titleFor(draft);

  const subtitleParts = [updatedLabel, statusLabel, sourceLabel].filter(
    (part) => part.length > 0,
  );
  const amountLabel =
    draft.amountMinor === undefined || draft.currencyCode === undefined
      ? 'amount not captured'
      : describeAmount(draft.amountMinor, draft.currencyCode, {
          includeDirection: false,
        });

  const issueLabel =
    issueCount === 0
      ? ''
      : issueCount === 1
        ? ', 1 issue to resolve'
        : `, ${issueCount} issues to resolve`;

  return {
    id: draft.id,
    title,
    subtitle: subtitleParts.join(' · '),
    statusLabel,
    statusTone,
    amountMinor: draft.amountMinor ?? null,
    currencyCode: draft.currencyCode ?? null,
    sourceLabel,
    updatedLabel,
    issueCount,
    accessibilityLabel: `${title}. ${statusLabel}. ${sourceLabel}. Updated ${updatedLabel}. ${amountLabel}${issueLabel}.`,
  };
}

/**
 * Build the inbox from every draft the repository returned. Drafts in
 * terminal states (`confirmed`, `discarded`, `capturing`, `processing`)
 * are filtered out — an inbox only lists work the user can act on.
 */
export function createDraftsInboxViewModel(
  drafts: readonly ExpenseDraft[],
  now: Date = new Date(),
): DraftsInboxViewModel {
  const actionable = drafts
    .filter(isInboxDraft)
    .slice()
    // Newest first; ISO-8601 strings sort chronologically.
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));

  const rows = actionable.map((draft) => toRow(draft, now));
  const reviewCount = actionable.filter((d) => d.status === 'needs_review').length;
  const readyCount = actionable.filter((d) => d.status === 'ready').length;
  const total = rows.length;

  return {
    rows,
    reviewCount,
    readyCount,
    isEmpty: total === 0,
    headline: 'Drafts',
    summary:
      total === 0
        ? 'Captured receipts waiting for confirmation will appear here.'
        : `${total} ${total === 1 ? 'draft' : 'drafts'} waiting for you — ${reviewCount} to review, ${readyCount} ready to confirm.`,
  };
}
