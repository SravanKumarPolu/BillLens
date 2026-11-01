# Final implementation report — BillLens v2.26.0 (2026-10-23)

## 1. Scope and method

This pass continued from the uploaded `BillLens(5)` archive (v2.25.0
documentation-audit state). Nothing was rebuilt: the existing local-first
architecture (Expo Router + TypeScript, SQLite primary store, clean
domain/application/infrastructure/presentation layering) is preserved, as
are all existing features, dependencies, migrations and interfaces.

Method:

1. Read all authoritative documents (01-PRD … 09-DEPLOYMENT_PLAN,
   REQUIREMENTS_TRACEABILITY, DOCUMENTATION_AUDIT_2026-10-23, AGENTS.md,
   IMPLEMENTATION_STATUS/PROGRESS/BLOCKERS, FEATURE_MATRIX, CHANGELOG).
2. Executed the full documented gate chain on the as-received tree to
   establish ground truth (the 2026-10-23 documentation audit had
   re-run nothing).
3. Audited every feature area against actual code via four parallel
   read-only code audits, then **personally re-verified every critical
   claim with file:line reads** before changing anything.
4. Implemented the confirmed defects with the smallest safe changes and
   added regression tests for each fix.
5. Re-executed every gate; updated documentation to match reality.

## 2. Environment-exposed breakage repaired (test infrastructure)

The as-received suite depended on an external `sqlite3` CLI binary:

- 15 integration suites silently **skipped** (54 tests), `db:verify`
  printed "skipping", and `two-device-sync.test.ts` **failed** (4 tests)
  because it lacked the availability guard.
- Fix: the shared test double `sqlite-cli-database.ts` now runs on
  Node's built-in `node:sqlite` (`DatabaseSync`) — a real SQLite engine
  with native parameter binding, real `BEGIN/COMMIT/ROLLBACK`
  transactions and `PRAGMA foreign_keys = ON`, matching the production
  driver's semantics; the `sqlite3` CLI remains the fallback for very
  old Node runtimes. `scripts/verify-sqlite-schema.js` gained the same
  engine preference.
- The higher-fidelity engine immediately surfaced a latent test bug:
  two `backup-attachments` tests inserted receipts without seeding the
  FK-referenced group (impossible to catch with FK enforcement off).

## 3. Product defects fixed (all verified in code before fixing)

### Receipt scan → review → save pipeline (P0)

1. **Receipt rows were never persisted from real scans.** The confirm
   flow only received an image URI through a test-only prop; the
   production route passed nothing, so no Receipt row was created and
   the review screen never displayed the receipt photo. The screen now
   resolves the URI from the draft's CaptureSource (prop override kept
   for tests) and passes it to the confirm use case, which persists the
   receipt + items + expense atomically.
2. **Discard was store-only** — discarded drafts reappeared in the
   inbox forever. New `DiscardExpenseDraftUseCase` (application layer,
   domain transition, idempotent) wired into `CaptureServices` and the
   review screen.
3. **"Adjust items & split" left its source draft confirmable** — after
   saving an itemized expense from a draft, the draft remained active,
   inviting a duplicate expense. The itemized screen now discards the
   source draft after a successful save.
4. **Groupless drafts (home capture FAB) were a dead end** — confirm
   demanded a group but no selector existed. The review screen now
   renders a group picker; `canConfirm` blocks with an explicit
   "Select a group first" state until a group is linked.
5. **"Choose another image" always opened the gallery** even after a
   camera capture (`sourceType` was never propagated). Fixed in both
   capture screens; the image-quality screen already supported it.
6. **Permission-denied cards navigated back instead of opening
   settings** despite copy telling users to grant permission in
   settings. Both camera and gallery now offer `Linking.openSettings()`.

### Financial correctness

7. **Settlement method picker offered `card`/`wallet`, which the local
   schema's CHECK constraint rejects** — selecting either produced a
   guaranteed on-device save failure (tests missed it: the in-memory
   double ignores CHECKs). The picker now offers exactly the four
   locally persistable methods.
8. **Itemized amount parsing used float math hardcoded to two
   decimals** (`Math.round(Number × 100)`), breaking 0-decimal (JPY)
   and 3-decimal (KWD) currencies. Now uses the shared strict
   currency-aware integer parser; formatting uses the domain decimals
   table (also fixed in the manual-expense edit prefill).

### Settings and flows

9. **Group settings rename/archive/unarchive were store-only** — the
   UI changed but SQLite did not (diverging from the real path used by
   the group home menu). All three now persist through the real use
   cases (version-guarded, archived-group guard).
10. **"Leave group" was a no-op control with destructive copy** (it
    only filtered the UI list). Removed; leaving requires the identity
    adapters and remains a documented limitation.
11. **Group creation failures were swallowed silently** (the catch
    block returned without feedback). Errors now surface via alert +
    inline text, and the submit button is disabled while writing.
12. **Void expense passed the expense's creator as the actor** — the
    permission check could never fail. Now passes the actual local
    identity.
13. **Pending-confirmation cards hardcoded `expectedVersion = 2`** —
    any settlement whose version advanced (e.g. after a correction)
    could not be confirmed. The real persisted version is threaded
    through the view model.
14. **Backup restore alert claimed receipt images are not included** —
    stale copy; v2 backups embed and restore attachments. The alert now
    reflects the selected backup's actual contents.

## 4. Regression tests added

- `src/application/capture/__tests__/discard-expense-draft.usecase.test.ts`
  (5 tests: persist, idempotency, confirmed-rejection, version
  conflict, missing draft).
- `src/presentation/screens/__tests__/draft-review-container.test.tsx`
  (2 tests over the real container + in-memory composition root:
  capture-image resolution + receipt persisted on confirm; groupless
  picker gating).
- Settlement method picker offers exactly the four persistable methods.
- Pending-confirmation entries carry (and confirm with) the persisted
  settlement version.
- Updated assertions for intentionally changed behavior (camera/gallery
  query strings, open-settings actions, groupless confirm gating,
  removed Leave control).

## 5. Features preserved (no behaviour removed)

All P0 features verified present and tested: groups (create/edit/
members/archive/restore/safe-delete), four split types + item-level +
multi-payer, balances + simplification, settlements (partial, confirm,
dispute), offline queue + boot recovery, drafts pipeline, receipts
history, retention, backup/restore, exports, search, recurring,
reminders (opt-in), notifications (Expo Go guarded), account deletion,
erase-data, feedback, metrics dashboard, web export. The encrypted-sync
engine, relay reference, invitations module and Supabase path are
unchanged in code and status.

## 6. Deliberately NOT done (with reasons)

- **Wiring the encrypted relay/invitation UI into the app**: the PRD
  scopes remote encrypted sharing as P2; the relay is not deployed; the
  user-facing promise would be false without a working transport. Kept
  BLOCKED and documented (see `KNOWN_LIMITATIONS.md`).
- **Settlement reversal/detail screens**: use cases exist and are
  tested, but no PRD requirement mandates them for this release; adding
  screens would expand scope. Documented as the top functional gap.
- **Schema change to accept `card`/`wallet` settlement methods**: would
  require a coordinated local + cloud migration; restricting the picker
  is the smallest safe fix for release.
- **No new dependencies were added.** No public interfaces were broken.
