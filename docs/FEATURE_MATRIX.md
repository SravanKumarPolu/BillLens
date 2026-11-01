# Feature matrix (2026-10-23, v2.26.0)

Statuses: **VERIFIED** (tests in this repo), **DEVICE-UNTESTED**,
**PARTIAL**, **MISSING**, **EXTERNAL** (credentials/hardware/provider).

## Core expense splitting

| Feature | Original | Final | Evidence / blocker |
|---|---|---|---|
| Create/edit/archive group | Verified | Verified | archive guard at app + SQLite layers; real-SQLite matrix |
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
| Settlement history | Verified | Verified | activity timeline (expenses + settlements) + balances-screen pending cards; no dedicated settlement-detail screen |
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
| Retention + local deletion | Verified | configurable review, temp cleanup, guarded erase-all |
| Expense voiding | Verified | use case + detail screen |
| Search / filters | Verified | `/search`: title/note text, group, date, pagination |
| Navigation integrity | Verified (static) | route-link test; dead sign-in control removed |
| Recurring expenses | Verified | daily/weekly/monthly/yearly; catch-up + idempotency tests |
| PDF / XLSX export | Implemented, device-untested | lazy `expo-print`/`xlsx` chunks; escaped HTML |
| Reminders / notifications | Implemented, device-untested | opt-in daily local reminder (Expo Go guarded); per-settlement reminder use cases exist without UI; no push |
| Encrypted backup / restore | Verified (Node/SQLite) | receipt rows now actually persisted; images included |
| Receipt history / deletion | Verified (Node/SQLite) | `/receipts`; soft delete + queue image cleanup |
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

## v2.26.0 repairs (2026-10-23)

- Receipt rows now persist from real scans (capture image resolved on the
  review screen); discard is durable; itemized "Adjust items & split"
  closes its source draft; groupless drafts get an in-screen group picker.
- Settlement method picker matches the local schema CHECK (card/wallet
  removed — they failed on-device saves).
- Itemized entry + edit prefill are currency-decimal aware (no float math).
- Group settings rename/archive/unarchive persist through the real use
  cases; the no-op Leave control was removed.
- Real-SQLite integration tests now run on `node:sqlite` (224 suites /
  4,960 tests, 0 skipped in this environment).

## Highest-priority next gaps

1. Encrypted sync UI + a deployed relay (external hosting approval; PRD P2).
2. Physical-device verification of camera/OCR, notifications, PDF/XLSX share.
3. FX conversion with a documented rate source.
4. Settlement reversal + dedicated settlement-detail screen (use cases exist, no UI).
5. Expense categories/statistics beyond the current stored category field.
