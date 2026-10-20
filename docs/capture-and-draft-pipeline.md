# BillLens — Capture and Draft Pipeline

> Status: **Phase 1 · Revised Prompt 1-8 complete.**

This document describes the end-to-end pipeline from image capture to
confirmed expense, including the draft lifecycle, confidence tracking,
and the hard rule that OCR output NEVER directly creates an expense.

## 1. Pipeline overview

```
Camera / Gallery / Share Extension
              ↓
        Capture Intake
              ↓
       Document Classifier
              ↓
   Receipt / Payment / Invoice
              ↓
          OCR Adapter
              ↓
      Structured Extraction
              ↓
       Confidence Engine
              ↓
       Validation Engine
              ↓
     Editable Expense Draft
              ↓
     [User Review + Edit]
              ↓
     Confirm Draft → Final Expense
```

## 2. Capture Source

A `CaptureSource` represents the origin of an image — camera, gallery,
share extension, or file import. Each capture source has a processing
lifecycle:

```
pending → processing → completed
                     → failed
                     → cancelled
```

**Crash recovery**: On app launch, `recoverInterruptedDrafts()` resets
any capture sources stuck in `processing` back to `pending`, allowing
the user to retry.

**Duplicate prevention**: Before processing, `checkDuplicateScan()`
checks the image hash against existing capture sources. If a duplicate
is found, the user is warned (not blocked).

## 3. Extraction Result

An `ExtractionResult` is the immutable output of the OCR + parsing
pipeline. It contains:

- Per-field `ExtractedField<T>` with confidence scores
- Line items with per-item confidence
- Overall confidence score
- Whether the total matches the sum of items + charges
- Raw OCR text (optional — controlled by privacy preferences)

**Storage decision**: Extracted fields are stored as JSONB inside the
`extraction_results` table (not as separate rows). Justification:
draft-stage data is mutable, field counts vary, and per-field querying
is not needed during the draft stage. Confirmed financial data is stored
relationally in `expenses`, `expense_payers`, `expense_splits`.

## 4. Expense Draft lifecycle

The `ExpenseDraft` is the CENTRAL entity — the editable intermediate
between capture and final expense.

```
processing → needs_review → ready → confirmed
                              ↓
                          discarded
```

### Status transitions

| From | To | Trigger |
|------|----|---------|
| (created) | `processing` | Capture pipeline starts |
| `processing` | `needs_review` | Extraction complete, user review needed |
| `needs_review` | `ready` | User has resolved all issues |
| `ready` / `needs_review` | `confirmed` | User confirms → final Expense created |
| `ready` / `needs_review` | `discarded` | User discards the draft |

### HARD RULE: Drafts do not enforce strict financial invariants

Drafts may have:
- Missing fields (no amount, no title)
- Mismatched totals (items don't sum to total)
- Unassigned items
- Low-confidence values

Strict financial invariants (payer total = expense total, split total =
expense total, percentage = 100%) are enforced ONLY when the draft is
promoted to a final `Expense` via `confirmExpenseDraft()`.

## 5. Confidence and Trust

Every extracted field carries an `ExtractionConfidence` (0.0 to 1.0):

| Level | Range | Behavior |
|-------|-------|----------|
| High | ≥ 0.85 | Auto-accepted, no review needed |
| Medium | ≥ 0.60 | Shown with medium-confidence indicator |
| Low | ≥ 0.30 | Flagged for review |
| Unknown | < 0.30 | Must be manually verified |

`FieldReviewIssue` entities track specific problems:
- `low_confidence` — field below threshold
- `total_mismatch` — items + charges ≠ total
- `missing_field` — required field absent
- `duplicate_item` — possible duplicate line item
- `invalid_value` — value fails domain validation
- `unassigned_items` — items without member assignment
- `currency_mismatch` — currency differs from group
- `date_in_future` — receipt date is in the future
- `amount_unreasonable` — amount seems too large/small

## 6. Payment Evidence vs Receipt

| Aspect | Receipt | Payment Evidence |
|--------|---------|-----------------|
| What it proves | What was purchased | That money was paid |
| Contains items | Yes (line items) | No |
| Contains split info | No (user assigns) | No (user confirms) |
| Creates expense directly | No (goes through draft) | No (goes through draft) |

**Rule**: A payment screenshot is evidence of payment, NOT proof of a
complete shared expense. The user must confirm:
1. What the payment was for
2. Which group it belongs to
3. Who participated
4. How it should be split

## 7. CaptureProcessor interface

The `CaptureProcessor` port (`src/domain/ports/capture-processor.port.ts`)
is provider-agnostic:

```ts
interface CaptureProcessor {
  process(input: CaptureProcessorInput): Promise<ExtractionResult>;
}
```

It returns `ExtractionResult` ONLY — never `Expense`, `ExpenseDraft`,
or any financial record. The application layer creates the draft from
the extraction result.

## 8. Item Assignment

After extraction, the user assigns receipt line items to group members
using the `ItemAssignmentService`:

- Assign one item to one member
- Assign an item to multiple members (equal split)
- Split selected items equally among all members
- Assign all unassigned items to one member
- Copy assignment from a similar item
- Undo an assignment

The `AssignmentValidator` verifies that `Σ items + Σ charges === expectedTotal`
before the draft can be confirmed.

## 9. Duplicate Detection

`DuplicateCandidate` entities flag potential duplicates using 5 match bases:

| Basis | What it matches |
|-------|----------------|
| `transaction_reference` | Same UPI/bank transaction ID |
| `image_hash` | Same image bytes (SHA-256) |
| `amount_and_merchant` | Same amount + merchant + date |
| `ocr_fingerprint` | Similar OCR text |
| `manual` | User flagged manually |

The app WARNS the user — it does not silently block duplicate creation.

## 10. Privacy controls

`ReceiptPrivacyPreference` controls data retention:

| `storageMode` | Image retained? | OCR text retained? | Cloud upload? |
|---------------|-----------------|-------------------|---------------|
| `local_only` | On device only | On device only | No |
| `cloud_private` | Cloud (private) | Cloud (private) | Yes |
| `shared_with_group` | Cloud (group-visible) | Cloud (group-visible) | Yes |
| `delete_after_extraction` | Deleted after OCR | Only structured fields | Structured data only |

The sync engine enforces these rules via `privacy-aware-sync-rules.ts`:
`canUploadReceiptImage()` returns false for `local_only` and
`delete_after_extraction`.
