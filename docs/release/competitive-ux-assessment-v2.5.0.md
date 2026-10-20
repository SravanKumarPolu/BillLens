# BillLens v2.5.0 — Competitive UX Assessment

**Method:** feature/flow comparison against established expense-sharing
products (Splitwise, Tricount, Settle Up), evaluated ONLY against
features that exist and are verifiable in the v2.5.0 codebase (with the
covering tests/screens named). No competitor assets or code were used.
Where BillLens has no counterpart feature, it is recorded as a gap with
a release-relevance verdict — gaps that would require new subsystems
were deliberately NOT implemented in this pass (release-stability rule).

---

## 1. Scorecard (supported, verifiable features only)

| Dimension | BillLens v2.5.0 | Splitwise (reference) | Tricount (reference) | Verdict |
|---|---|---|---|---|
| Ease of expense entry | Manual form (5 split ways), camera/gallery capture, receipt OCR with confidence-gated review, duplicate-image guard | Fast manual entry, no built-in OCR (cloud "scan" outsourced) | Extremely fast manual tally entry | **Competitive** — OCR-with-verification is a differentiator; Tricount wins on raw entry speed for tiny groups |
| Receipt scanning | Full pipeline: quality review → OCR (Cloud Vision) → confidence-labeled fields → issues-gated confirm; honest unavailable state | N/A | N/A | **Ahead** of both references (when the backend credential is provisioned; honestly blocked otherwise) |
| Splitting accuracy | Integer minor-unit Money; deterministic largest-remainder across 0/2/3-decimal currencies; property-proved total preservation (P1–P8) | Cent-exact, fewer split modes | Simple division focus | **Competitive or better** on correctness guarantees |
| Group collaboration | Groups, members, invites (token model staged), roles, group settings | Full multi-user realtime | Single-device by design | **Between** the two: cloud collaboration is code-complete but live-verified only with a provisioned project |
| Balance transparency | Per-currency net balances with per-expense explanation drill-down (deterministic, verified data), degraded/unavailable states, "who paid what" breakdown | Simplify-debts view + IOU detail | Plain balances | **Competitive or better** — explanations are first-class UI, not an afterthought |
| Settlement clarity | Suggest→record→confirm/dispute→reverse lifecycle, receiver-only confirmation, overpayment guard, atomic reversal | Simplified payments, less formal confirmation | Settle flags only | **More rigorous** than both (deliberately stricter workflow) |
| Offline capability | Offline-first SQLite; full queue with idempotent retries, conflict records, honest sync-status UI | Mostly online; some offline caching | Local-first, no cloud sync | **Ahead of Splitwise**, at parity with Tricount's local-first model plus a cloud path |
| Error recovery | Typed error taxonomy in capture/sync; retry/backoff; boot recovery; conflicts never silently merged; unavailable ≠ zero states | Generic error toasts | Minimal | **Ahead** — this release specifically hardened the previously-broken queue paths |
| Privacy & user trust | Receipts local-only by default; tokens in Keychain/Keystore; RLS-scoped cloud access; documented purge lifecycle; no third-party analytics in the RC | Cloud-hosted, ad-supported tier | Local-first | **Strongest** of the three on the RC's defaults |
| Navigation simplicity | 4 tabs + modals; capture as a full-screen modal; deep-linkable routes (documented scheme) | 5 tabs, heavier IA | 3 tabs, minimal | **Competitive** |
| Visual polish | Modern SaaS + Minimalism + Bento UI, light/dark/system, motion honoring reduce-motion, capped money font-scaling | Mature consumer polish | Utilitarian | **Competitive**; deliberately less playful than Splitwise |

## 2. Genuine gaps (and why they were not built now)

1. **Push-only cloud sync (no incremental download adapter).** Splitwise
   syncs in real time. The port exists (`DownloadCursorPort`,
   `incremental-download` rules + tests) but no remote implementation.
   *Release impact:* medium-low — devices converge on next sync trigger;
   the RC queue UX is honest about it. *Needed before:* marketing "live
   collaboration" claims.
2. **No recurring expenses / reminders-driven UX.** Splitwise's
   recurring expenses are a heavy-use convenience. BillLens has the
   settlement_reminders table but no user-facing recurrence UI.
   *Release impact:* low for an RC; roadmap.
3. **No comments/attachment threads on expenses.** *Release impact:*
   low; not core to trust-in-numbers.
4. **Multi-currency expenses within one group.** BillLens enforces the
   group-currency invariant (fixed in this release); Splitwise allows
   foreign-currency expenses with conversion. *Release impact:* medium
   for travel groups; requires a conversion-rate data source (external
   dependency + privacy decision) — deferred deliberately.
5. **Receipt scan latency/quality feedback loops** (server cost of a
   rescan, ML-assisted item extraction) — Cloud Vision integration is
   wired, item-level extraction is documented roadmap.

## 3. High-priority improvements implemented in this pass (from the audit)

- Honest OCR: production can never receive mock/sample extraction data
  (app-side guard AND server-side stub refusal), unavailable state with
  manual-entry fallback, DEMO banner in dev.
- Honest sync status: pending vs needs-review counters, reachable
  status screen, dashboard no longer mislabels pending as failed.
- Keyboard avoidance on all form screens (iOS focus coverage).
- Fresh-database deployability of the security posture (RLS migration
  fixes) — previously a deployer could NOT reproduce the documented
  posture at all.

## 4. Conclusion

BillLens v2.5.0 is positioned as the "trust and correctness" option in
the category: stronger financial invariants, stronger error recovery,
stronger privacy defaults, and a receipt pipeline neither reference has
built-in. The decisive competitive work remaining is external:
provisioning the backend (live OCR + live cloud) and device verifying
the flows — not additional features.
