# Receipt lifecycle

## Capture → expense

1. Camera/gallery image is copied to app storage and validated.
2. ML Kit/local parser (or mock in development) creates a draft.
3. The user reviews/corrects fields and item assignments.
4. On confirmation the UnitOfWork atomically writes:
   - `receipts` row (merchant, total, date, currency, local image URI),
   - `receipt_items` rows (including assigned members),
   - the expense with `receipt_id`,
   - item-level splits when items + charges reconcile,
   - the confirmed draft state.
5. Any failure rolls back all of the above.

## History and deletion

- `/receipts` lists saved receipt metadata and thumbnails per group.
- “Delete” soft-deletes the receipt row and enqueues its image in the existing
  durable `file_cleanup_queue`; linked expenses and balances are unchanged.
- Receipt images are included in encrypted backup v2; receipt rows are part of
  the normal financial backup tables.

## Limitations

- Receipt source is recorded as `paper` for draft confirmations; gallery/UPI
  source nuance is not preserved yet.
- Receipt history is capped at 50 receipts per group per load.
- Image thumbnails use the full local image (no generated thumbnail cache).
- Native OCR and device image rendering remain device-unverified.
