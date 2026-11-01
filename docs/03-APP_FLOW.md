> **BillLens v2.25.0 | Repository-grounded documentation audit | 2026-10-23**  \n> Source snapshot: `BillLens(5).zip`. Statuses describe source inspection and previously documented tests; **no native device tests were executed during this audit**.  \n> These consolidated files supersede conflicting planning claims; historical files remain available.

# App flow and route inventory

## Principal journeys
1. First launch → welcome → guest name → permissions (optional) → complete → main tabs; all local functions must work with permissions denied.
2. Group → create/edit → manage members → add expense → select payer(s), currency, split → validate → SQLite save → balances/activity.
3. Capture → camera/gallery → persist readable local image → quality review → processing/OCR → editable draft → explicit confirmation → expense. If image inaccessible, offer retake/reselect and manual entry without losing other draft fields.
4. Settlement → suggestion/preview → create pending record → receiver confirms → balances update; failed/reversed records do not affect settled totals.
5. Data/settings → export/backup/retention review → explicit deletion; verify permissions and destructive guards.
6. Remote collaboration is **not yet a verified complete app journey**; invitation/relay/key recovery/conflict review must remain marked partial.

## Screen-state contract
Every route must show loading, empty, success, validation, permission-denied, offline and recoverable-error states where applicable. Disable duplicate submissions, preserve unsaved form state, avoid navigation until durable save confirmed, and provide visible retry. Never show “synced” merely because a local operation was queued.

## Actual Expo Router inventory
| Route file | Primary purpose | Audit note |
|---|---|---|
| `app/(tabs)/activity.tsx` | Other navigation | Route exists; action/permission/device path requires scenario verification |
| `app/(tabs)/groups.tsx` | Other navigation | Route exists; action/permission/device path requires scenario verification |
| `app/(tabs)/index.tsx` | Other navigation | Route exists; action/permission/device path requires scenario verification |
| `app/(tabs)/settings.tsx` | Other navigation | Route exists; action/permission/device path requires scenario verification |
| `app/capture/camera.tsx` | Capture and review | Route exists; action/permission/device path requires scenario verification |
| `app/capture/gallery.tsx` | Capture and review | Route exists; action/permission/device path requires scenario verification |
| `app/capture/image-quality.tsx` | Capture and review | Route exists; action/permission/device path requires scenario verification |
| `app/capture/index.tsx` | Capture and review | Route exists; action/permission/device path requires scenario verification |
| `app/capture/processing.tsx` | Capture and review | Route exists; action/permission/device path requires scenario verification |
| `app/drafts/[draftId].tsx` | Draft review | Route exists; action/permission/device path requires scenario verification |
| `app/drafts/index.tsx` | Draft review | Route exists; action/permission/device path requires scenario verification |
| `app/expenses/[expenseId].tsx` | Expense creation/edit/details | Route exists; action/permission/device path requires scenario verification |
| `app/expenses/edit/[expenseId].tsx` | Expense creation/edit/details | Route exists; action/permission/device path requires scenario verification |
| `app/expenses/itemized/new.tsx` | Expense creation/edit/details | Route exists; action/permission/device path requires scenario verification |
| `app/expenses/items/[expenseId].tsx` | Expense creation/edit/details | Route exists; action/permission/device path requires scenario verification |
| `app/expenses/new.tsx` | Expense creation/edit/details | Route exists; action/permission/device path requires scenario verification |
| `app/groups/[groupId]/balances.tsx` | Group and member management | Route exists; action/permission/device path requires scenario verification |
| `app/groups/[groupId]/index.tsx` | Group and member management | Route exists; action/permission/device path requires scenario verification |
| `app/groups/[groupId]/settings.tsx` | Group and member management | Route exists; action/permission/device path requires scenario verification |
| `app/groups/delete/[groupId].tsx` | Group and member management | Route exists; action/permission/device path requires scenario verification |
| `app/groups/edit/[groupId].tsx` | Group and member management | Route exists; action/permission/device path requires scenario verification |
| `app/groups/join.tsx` | Group and member management | Route exists; action/permission/device path requires scenario verification |
| `app/groups/members/[groupId].tsx` | Group and member management | Route exists; action/permission/device path requires scenario verification |
| `app/groups/new.tsx` | Group and member management | Route exists; action/permission/device path requires scenario verification |
| `app/index.tsx` | Other navigation | Route exists; action/permission/device path requires scenario verification |
| `app/modal/explanation.tsx` | Other navigation | Route exists; action/permission/device path requires scenario verification |
| `app/onboarding/complete.tsx` | Onboarding | Route exists; action/permission/device path requires scenario verification |
| `app/onboarding/guest-name.tsx` | Onboarding | Route exists; action/permission/device path requires scenario verification |
| `app/onboarding/permissions.tsx` | Onboarding | Route exists; action/permission/device path requires scenario verification |
| `app/onboarding/welcome.tsx` | Onboarding | Route exists; action/permission/device path requires scenario verification |
| `app/receipts/index.tsx` | Other navigation | Route exists; action/permission/device path requires scenario verification |
| `app/recurring/index.tsx` | Other navigation | Route exists; action/permission/device path requires scenario verification |
| `app/recurring/new.tsx` | Other navigation | Route exists; action/permission/device path requires scenario verification |
| `app/search.tsx` | Other navigation | Route exists; action/permission/device path requires scenario verification |
| `app/settings/backup.tsx` | Data and settings | Route exists; action/permission/device path requires scenario verification |
| `app/settings/data.tsx` | Data and settings | Route exists; action/permission/device path requires scenario verification |
| `app/settings/delete-account.tsx` | Data and settings | Route exists; action/permission/device path requires scenario verification |
| `app/settings/erase-data.tsx` | Data and settings | Route exists; action/permission/device path requires scenario verification |
| `app/settings/feedback.tsx` | Data and settings | Route exists; action/permission/device path requires scenario verification |
| `app/settings/metrics.tsx` | Data and settings | Route exists; action/permission/device path requires scenario verification |
| `app/settings/sync.tsx` | Data and settings | Route exists; action/permission/device path requires scenario verification |
| `app/settlements/new.tsx` | Settlement workflow | Route exists; action/permission/device path requires scenario verification |
| `app/settlements/preview.tsx` | Settlement workflow | Route exists; action/permission/device path requires scenario verification |

## Testable navigation acceptance
Route-link static checks, Android back navigation, tab switching, duplicate-tap save, process death during capture, gallery URI expiration, missing permission, restored drafts, pending settlement and offline startup. `docs/navigation-map.md` is historical design context, not proof every button was device-tested.
