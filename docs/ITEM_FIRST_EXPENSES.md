# Item-first expense creation

## Entry points

- Groups → Add expense → **Itemized expense**.
- Receipt draft review → **Adjust items & split** (pre-fills parsed items/charges).
- Expense detail → **Edit items** for previously saved itemized expenses.

## Flow

1. Enter title/date, items (name, quantity, unit price, participants), charges
   (tax, tip, service, discount) and one or more payers.
2. Bill total = item totals + charges − discount. Payer contributions must match
   exactly; the save button stays disabled until they do.
3. Member preview is computed by `ItemSplitStrategy` (the same engine used for
   persistence), with deterministic remainder distribution.
4. Save calls `CreateExpenseManuallyUseCase` with `splitType: 'items'` and a
   mount-stable expense id, so a retry/duplicate tap cannot create two expenses.
5. On success the local draft key is cleared and the group screen opens.

## Draft safety

- Unsaved fields autosave to AsyncStorage after 400 ms and restore on return.
- The draft is never treated as a finalized expense.
- Parser/OCR failure leaves the manual item screen fully usable.

## Limits

- A single currency per group (existing invariant).
- Receipt images are associated through the existing receipt flow; item-first
  creation itself does not attach an image.
- Draft autosave is per group; it is not encrypted at rest beyond the app
  sandbox.
