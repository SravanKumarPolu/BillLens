# BillLens — Expense Draft Review

> Status: **Phase 2 · Prompt 18 complete.**

## 1. Review sections

```
Source preview → Merchant/title → Date → Currency → Subtotal/charges → Total →
Line items → Payer → Participants → Split method → Issues/confidence → Confirm
```

## 2. Confidence display

Every extracted field shows:
- StatusDot (green/amber/red/grey) — colour is SECONDARY reinforcement
- Text label: "High confidence" / "Medium confidence — review suggested" / "Low confidence — must review" / "Unknown"
- Manually corrected fields: blue "Edited" badge

## 3. Issue states

| Issue | Severity | Blocks confirmation? |
|-------|----------|---------------------|
| Missing total | Error | Yes |
| Total mismatch | Error | Yes |
| Tax mismatch | Warning | No |
| Duplicate candidate | Warning | No |
| Unsupported currency | Error | Yes |
| Missing payer | Error | Yes |
| Missing participants | Error | Yes |
| Unassigned item | Warning | No |
| OCR text conflict | Warning | No |
| Payment pending | Info | No |
| Payment failed | Warning | No |
| Date uncertainty | Info | No |

## 4. Confirmation rule

The "Confirm Expense" button is DISABLED while any error-severity issue exists.
The button label shows the blocking count: "Confirm (2 issues to resolve)".

## 5. Draft persistence

- Edits saved to `useDraftStore` (Zustand + AsyncStorage)
- `hasUnsavedChanges` flag protects against accidental navigation
- Drafts survive app restart

## 6. Editing

Users can: correct merchant, amount, date, add/delete line items, adjust charges, change currency, choose payer, choose participants, change storage preference, discard draft.

## 7. Architecture

- Screen reads from `DraftReviewViewModel` (pure projection)
- No domain calculations in the screen
- Confidence data comes from the domain `ExtractionConfidence` value object
- Confirmation calls the application use case (stub for Phase 2)
