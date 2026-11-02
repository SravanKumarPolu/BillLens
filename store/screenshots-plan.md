# Screenshot Plan — Store Submission

> Prompt 77: screenshots must show implemented production behaviour,
> use synthetic data only, and avoid real personal/bank data.

## Rules (enforced at capture time)

- Use the seeded demo dataset (`supabase/seed.sql` derived fixtures):
  names like "Asha", "Rohan"; group "Goa Trip".
- Never include real receipts, real UPI IDs, real phone numbers, real
  bank apps, or unauthorised brand logos (mask OS status bar / UPI app
  branding if visible).
- Dark and light theme pairs are captured for both platforms.
- 6.7" (1290×2796) and 5.5" (1242×2208) iPhone sets; 6.7" Android set.

## Shot list (order = store display order)

| # | Screen | State to capture | Caption idea |
|---|--------|------------------|--------------|
| 1 | Home dashboard | 3 groups, net balance card, upcoming reminder | "Every group, one clear picture" |
| 2 | Group balances | Goa Trip, multi-currency (INR + GBP tabs) | "Balances you can actually understand" |
| 3 | Balance explanation modal | Per-expense breakdown for one member | "See exactly why someone owes what" |
| 4 | Receipt scan (camera) | Framed paper receipt, capture overlay | "Point. Scan. Done." |
| 5 | Draft review | OCR results with one low-confidence field highlighted | "Review before anything is saved" |
| 6 | Item assignment | 6 line items, 3 members, tap-to-assign | "Split the parts each person actually had" |
| 7 | Settlement preview | Simplified plan — 2 transfers instead of 5 | "Fewer transfers, same result" |
| 8 | UPI assist | Deep-link sheet with amount pre-filled (mock UPI app icon, neutral) | "Open your UPI app, pre-filled" |
| 9 | Offline | Offline banner + queued sync indicator | "Works without network" |
| 10 | Privacy settings | Receipt privacy + analytics opt-out | "Private by default" |

## App preview video (optional, 15–30 s)

Storyboard: launch → scan receipt → review draft → balances →
settlement preview → confirm. Show only implemented behaviour above;
no sped-up OCR; include the "review your extraction" step honestly.

## Capture checklist

- [ ] Fresh app state (no dev overlays, no debug badges)
- [ ] Demo dataset version pinned (record hash here at capture)
- [ ] Status bar cleaned (full battery, no carrier noise)
- [ ] Localisation matches store locale (en-US first pass)
- [ ] Both themes captured
- [ ] Each screenshot reviewed against the misleading-content rules
