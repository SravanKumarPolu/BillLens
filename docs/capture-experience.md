# BillLens — Capture Experience

> Status: **Phase 2 · Prompt 17 complete.**

## 1. Capture sources

| Source | Route | Description |
|--------|-------|-------------|
| Camera | `/capture/camera` | Paper receipts, live capture |
| Gallery | `/capture/gallery` | Existing receipt images |
| Payment screenshot | `/capture/camera?mode=payment` | UPI, bank, card screenshots |
| Manual entry | `/expenses/new` | No image — cash payments |

## 2. Capture entry screen

4 large cards with icons + descriptions. Privacy notice at bottom showing active storage mode.

## 3. Image quality review

- Full-screen image preview
- Quality warning banners: blurry, cropped, low-light, unsupported
- Phase 2: static notice "Image quality check is not yet available" (no fake CV)
- "Retake" and "Continue Anyway" buttons

## 4. Processing screen

- Indeterminate progress (NO fake percentages)
- Cycling status: "Preparing image" → "Reading text" → "Understanding document" → "Checking totals" → "Creating draft"
- Cancel button
- Failure state: "Processing failed" + Retry / Choose another / Add manually
- Privacy notice visible

## 5. Failure recovery

| Option | Action |
|--------|--------|
| Retry | Re-run processing |
| Choose another image | Return to capture entry |
| Continue manually | Navigate to manual expense with draft data |
| Save image for later | Store capture source, return to home |
| Delete capture | Remove capture source, return to home |

## 6. Privacy

The active storage mode is visible on every capture screen:
- "Stored only on this device"
- "Uploaded privately"
- "Shared with group"
- "Deleted after extraction"

## 7. Rules

- UI does NOT pretend extraction is complete
- Failure does NOT destroy the source image unexpectedly
- Development-only test states are clearly separated from production
