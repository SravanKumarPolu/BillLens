# Implementation blockers

| # | Blocker | Impact | What can proceed |
|---|---|---|---|
| 1 | No approval/credentials for a relay provider | Production encrypted sync cannot be deployed | Reference relay + local tests are complete |
| 2 | No second physical device / emulator in this environment | Cannot claim device-to-device delivery or background behaviour | Two independent identities + SQLite files simulated |
| 3 | No key-recovery design approved | Lost device = lost wrapped keys | Documented; re-wrap by a member is the manual path |
| 4 | Group-key delivery UI not designed | Invite token alone cannot decrypt history | Crypto wrap/unwrap and token primitives tested |
| 5 | Encrypted-event conflict rules not specified | Applying concurrent edits could diverge | Engine is transport-only; do not enable in production until specified |
| 6 | App wiring for the encrypted path not implemented | Current app still uses Supabase sync | Local-first, export, retention and deletion work |
| 7 | Independent security review not performed | Composition unaudited | Primitives from audited Noble libraries |
| 8 | Selected-expense deletion not implemented | Only whole local group copies can be removed; audit-safe voiding for expenses is a separate flow | Local group removal + retention work |
| 9 | Receipt image/draft cache clearing is only part of account deletion | No granular cache screen | Documented in DATA_RETENTION |

No paid infrastructure has been activated. Remote encrypted sync stays off
until 1, 4, 5 and 7 are resolved.
