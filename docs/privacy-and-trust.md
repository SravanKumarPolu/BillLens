# BillLens — Privacy and Trust

> Status: **Phase 1 · Revised Prompt 2, 8, 10 complete.**

This document describes BillLens's privacy controls and trust
architecture — the rules that ensure user data is handled transparently
and that OCR output is never blindly trusted.

## 1. Trust model

BillLens's competitive advantage is built on trust:

```
Capture → Extraction → [User Review] → Confirmation → Final Expense
```

The user is ALWAYS in the loop. No financial record is created without
explicit confirmation. This is enforced at the architecture level, not
just by code review.

### Hard rules (enforced by architecture)

1. **OCR output cannot directly create an expense.** The `CaptureProcessor`
   interface returns `ExtractionResult` only. The `ExpenseDraft` lifecycle
   (`processing → needs_review → ready → confirmed`) requires user
   confirmation before an `Expense` is created.

2. **Every extracted financial value is reviewable.** Each field is wrapped
   in `ExtractedField<T>` with a `confidence` score and `needsReview` flag.
   Fields below 0.85 confidence are automatically flagged.

3. **Payment screenshots are evidence, not expenses.** `PaymentEvidence`
   is a distinct entity. The user must confirm what the payment was for,
   which group it belongs to, who participated, and how it should be split.

4. **Explanation logic is independent from UI.** The Explanation Engine
   is a pure domain service that builds deterministic explanations from
   verified financial records. No uncontrolled AI/LLMs.

5. **Share-import does not bypass validation.** Images received via
   Android share intent enter the same `CaptureSource → ExtractionResult
   → ExpenseDraft → [Review] → Expense` pipeline.

## 2. Privacy preferences

`ReceiptPrivacyPreference` controls how captured receipt images and OCR
data are stored and synced.

### Storage modes

| Mode | Image location | OCR text | Cloud sync | Use case |
|------|---------------|----------|------------|----------|
| `local_only` | Device only | Device only | Never | Private expenses |
| `cloud_private` | Cloud (private) | Cloud (private) | Yes | Multi-device backup |
| `shared_with_group` | Cloud (group-visible) | Cloud (group-visible) | Yes | Group transparency |
| `delete_after_extraction` | Deleted after OCR | Not retained | Structured data only | Maximum privacy |

### Retention controls

- `retainRawText` (default: false) — whether raw OCR text is kept after
  structured fields are extracted
- `retainSourceImage` (default: true) — whether the source image is kept
- `retentionDays` (default: 30) — days after which the image is auto-deleted

### Enforcement

The `privacy-aware-sync-rules.ts` module enforces these preferences:
- `canUploadReceiptImage()` returns false for `local_only` and
  `delete_after_extraction`
- `canUploadRawText()` returns false when `retainRawText` is false
- `shouldDeleteImagePostExtraction()` returns true for
  `delete_after_extraction`

The sync engine checks these rules before enqueuing any receipt-related
sync operation.

## 3. Guest-to-cloud upgrade privacy

During guest-to-cloud upgrade, receipt images are migrated according to
their privacy preferences:

| Preference | Image migration | Structured data migration |
|-----------|----------------|--------------------------|
| `local_only` | Stays on device | Syncs to cloud |
| `cloud_private` | Uploads to cloud (private) | Syncs to cloud |
| `shared_with_group` | Uploads to cloud (group-visible) | Syncs to cloud |
| `delete_after_extraction` | Already deleted; not uploaded | Syncs to cloud |

**Rule**: Local-only files MUST NOT automatically upload to the cloud
during upgrade unless the user explicitly changes their privacy preference.

## 4. Audit trail

Every financial mutation is recorded in `audit_logs`. The audit trail
NEVER contains:
- Full receipt OCR text
- Card numbers, CVVs, expiry dates
- UPI IDs / VPA addresses
- Bank account numbers
- Transaction reference numbers (unless explicitly consented)

## 5. Forbidden in audit logs

```ts
// ❌ FORBIDDEN: Storing sensitive receipt data in audit
await auditRepo.append({
  entityType: 'receipt',
  entityId: receiptId,
  action: 'create',
  changeSummary: { ocrText: rawOcrText, upiId: 'user@upi' }, // ❌
});

// ✅ CORRECT: Only store field-level change summary
await auditRepo.append({
  entityType: 'receipt',
  entityId: receiptId,
  action: 'create',
  changeSummary: { fieldsChanged: ['merchant', 'total'], source: 'capture' },
});
```

## 6. Extraction observability (privacy-safe)

BillLens tracks extraction quality metrics to improve OCR accuracy.
All metrics are privacy-safe — no sensitive data is sent:

| Metric | What it tracks | What it does NOT track |
|--------|---------------|----------------------|
| OCR success rate | % of scans that produce a result | Receipt text, merchant names |
| Item detection success | % of scans with ≥1 line item | Item names, prices |
| Manual corrections count | # of fields user edited | Original/corrected values |
| Time to confirm | Seconds from scan to confirm | Receipt content |
| Duplicate warning rate | % of scans flagged as duplicate | Which expenses matched |
| Abandoned scan rate | % of drafts discarded | Draft content |

## 7. Confidence thresholds

| Threshold | Value | Meaning |
|-----------|-------|---------|
| High | ≥ 0.85 | Auto-accepted, no review needed |
| Medium | ≥ 0.60 | Shown with indicator, user can accept |
| Low | ≥ 0.30 | Must be reviewed before accepting |
| Unknown | < 0.30 | Must be manually verified |
| Draft review | < 0.70 | Entire draft flagged for mandatory review |

These thresholds are configurable in `src/config/capture.ts`.
