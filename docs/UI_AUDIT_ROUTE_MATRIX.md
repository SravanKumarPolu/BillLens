# UI / navigation audit matrix

Date: 2026-10-22. Source-level audit plus automated route-link test. **No
physical-device or TalkBack run.**

| Route | Feature | Source status | Device |
|---|---|---|---|
| `/onboarding/*` | Welcome, guest name, permissions, complete | Verified links; dead sign-in removed | Unverified |
| `/(tabs)` | Home dashboard | Verified | Unverified |
| `/groups` | Groups list, archived filter, search entry | Verified | Unverified |
| `/groups/new`, `/groups/join` | Create/join | Verified | Unverified |
| `/` group detail | Balances, recent, suggestions, menu | Archived actions hidden | Unverified |
| `/groups/edit/[id]` | Edit metadata/currency | Param guard, guarded currency | Unverified |
| `/groups/members/[id]` | Add/rename/deactivate | Param guard | Unverified |
| `/groups/delete/[id]` | Guarded deletion | Param guard, count preview | Unverified |
| `/expenses/new` | Manual expense | Modal | Unverified |
| `/expenses/itemized/new` | Item-first creation | Param guard | Unverified |
| `/expenses/edit/[id]` | Edit expense | Existing guard | Unverified |
| `/expenses/items/[id]` | Item editor | Param guard | Unverified |
| `/expenses/[id]` | Detail, void, repeat, items | Verified | Unverified |
| `/search` | Cross-group search | Verified | Unverified |
| `/recurring`, `/recurring/new` | Recurrence list/create | Verified | Unverified |
| `/capture/*` | Camera/gallery/review/processing | Replacement added | Native OCR unverified |
| `/drafts/*` | Draft inbox/review | Fake controls removed | Unverified |
| `/settlements/*` | Settlement flow | Existing | Unverified |
| `/receipts` | Receipt history/delete | Verified links | Unverified |
| `/settings/*` | Data, backup, erase, sync, metrics, feedback | Verified links | Unverified |

## Broken functionality found and corrected

1. Onboarding sign-in control pointed to a nonexistent `/auth/sign-in` route.
2. Expense-type “Simple” chip was a button with an empty handler.
3. Draft line-item edit icons and payer selector looked interactive but did
   nothing.
4. Deep links without required IDs rendered empty forms instead of redirecting.
5. Archived groups still exposed primary mutation actions until the use case
   rejected them.
6. Route integrity had no regression gate.

## Accessibility changes

- Non-interactive mode chip no longer exposes a button role.
- Removed misleading accessibility labels on inert controls.
- Archived state is announced in text, not color alone.
- Edit Group now has a header landmark.
- All new item/erase controls keep labels, roles and 44px-class targets.
- Confirmation dialogs remain native alerts with destructive actions.

Still device-only: TalkBack focus order, large font scaling, landscape layouts,
small-screen clipping, dynamic-type truncation, contrast measurement.

## Performance

- No new dependencies or eager native modules.
- Lists remain virtualised (Activity/search); recent expenses capped at five.
- Search uses the existing indexed SQL path; cleanup/drafts are bounded.
- Bundle measured after build, but no startup, scroll, memory, OCR or deletion
  timing was measured. No performance improvement is claimed.
