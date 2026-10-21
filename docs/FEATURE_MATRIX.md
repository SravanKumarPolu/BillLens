# Feature matrix (2026-10-21)

Statuses: **VERIFIED** (tests in this repo), **DEVICE-UNTESTED**,
**PARTIAL**, **MISSING**, **EXTERNAL** (credentials/hardware/provider).

## Core expense splitting

| Feature | Original | Final | Evidence / blocker |
|---|---|---|---|
| Create/edit/archive group | Verified | Verified | full edit form, category/icon, archive/restore; real-SQLite tests |
| Add/remove members | Verified | Verified | add/rename/deactivate UI; owner protected; history preserved |
| Manual expense entry | Verified | Verified | screen→SQLite test: ₹100 → four ₹25 splits |
| Equal split | Verified | Verified | domain strategy + use case + form |
| Exact split | **Missing in UI** | **VERIFIED** | `expense-split-types.test.ts`, form split field |
| Percentage split | **Missing in UI** | **VERIFIED** | basis-point engine + UI + tests |
| Shares split | **Missing in UI** | **VERIFIED** | weighted engine + UI + tests |
| Item-level split | Partial | Partial | domain engine + draft review; manual item editor still missing (no expense line-item table) |
| Multiple payers | Domain only | **VERIFIED** | form rows + use case + edit prefill; contributions must total |
| Balance calculation | Verified | Verified | balance engine tests + real SQLite flow |
| Debt simplification | Verified | Verified | suggestions use case/tests |
| Partial/full settlement | Verified | Verified | settlement state machine tests |
| Settlement history | Verified | Verified | list/detail/status screens |
| Expense history | Verified | Verified | group home recent + activity feed (virtualised) |
| Expense editing | Missing | **VERIFIED** | `UpdateExpenseUseCase`, edit route, prefill, version guard, tests |
| Offline persistence | Verified | Verified | real SQLite reopen test |

## Receipt OCR

| Feature | Status | Notes |
|---|---|---|
| Camera / gallery capture | Device-untested | camera API + picker enum + content-URI copy fixed; needs phone retest |
| Mock OCR pipeline | Verified | parser + draft tests |
| Merchant/date/total/lines | Verified (parser) | confidence + review UI |
| Discounts/tax/service | Partial | parser fields; coverage varies |
| Duplicate warning | Verified (domain) | duplicate detection tests |
| Confirm-before-save | Verified | drafts never auto-confirm |
| Remote OCR provider | External | needs Supabase + provider; receipt fixture unverified |

## Sync, security, retention

| Feature | Status | Notes |
|---|---|---|
| Offline queue / idempotency | Verified | sync repository tests |
| Supabase push/pull + conflicts | Verified in Node | project not configured here |
| Encrypted envelopes/keys | Verified | 25+ crypto tests |
| Encrypted event persistence/conflicts | Verified | migration 0008 tests |
| Encrypted sync in app | **MISSING** | not wired; relay not deployed |
| Invitations/key delivery/recovery | Verified (service) | no screens |
| Retention + local deletion | Verified | 365-day policy, guards, audit |
| Expense voiding | Verified | use case + detail screen |
| Search / filters | Verified | `/search`: title/note text, group, date, pagination |
| Recurring expenses | Verified | daily/weekly/monthly/yearly; catch-up + idempotency tests |
| PDF / XLSX export | Implemented, device-untested | lazy `expo-print`/`xlsx` chunks; escaped HTML |
| Reminders / notifications | Implemented, device-untested | opt-in daily local reminder; no push |
| Encrypted backup / restore | Verified (Node/SQLite) | DB tables only; receipt image files not included |
| Multi-currency display | Verified | per-currency balances |
| FX conversion | **MISSING** | no rates source; no 1:1 assumption |
| Guest → account migration | Partial | identity domain; no cloud project to verify |

## Splid parity (public capabilities, not independently tested)

Splid is a mature product with groups, offline use, unequal splits,
multiple currencies, recurring expenses, categories/statistics, export and
sync. BillLens now **matches the split-type core** (equal/exact/percentage/
shares), has offline-first SQLite + receipt→draft→review, and a tested
encrypted-sync core that is not shipped.

**Verdict: closer, still not better overall.** With split methods, editing and
multi-payer done, BillLens matches Splid's core split-and-edit workflows and is
ahead on receipt capture and local data controls. Search, recurring expenses,
PDF/XLSX export and local balance reminders are now implemented. It is still
behind on item-level manual expense editing, FX conversion, production encrypted
sync, on-device OCR, and device verification of notification/export/backup paths.

## Highest-priority next gaps

1. Item-level manual editor (needs `expense_line_items` persistence + assignment UI).
2. Encrypted sync UI + a deployed relay (external hosting approval).
3. FX conversion with a documented rate source.
4. Physical-device verification of camera, notifications, PDF/XLSX share.
5. Expense categories/statistics beyond the current stored category field.
