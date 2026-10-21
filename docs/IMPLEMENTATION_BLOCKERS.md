# Implementation blockers

| # | Blocker | Impact | What is already done |
|---|---|---|---|
| 1 | No relay deployment approval/credentials | No production encrypted sync | Reference relay + full Node tests; deployment guide |
| 2 | No second physical device/emulator | Cannot claim real device-to-device or background delivery | Two identities + two SQLite files + relay in Node |
| 3 | Encrypted sync not wired to app lifecycle/UI | Users still use Supabase (or local-only) | Engine, store, access service, status primitives |
| 4 | Conflict review UI/resolution apply missing | Conflicts persist but cannot be resolved from the app | Conflict rules, records, status transitions |
| 5 | Invitation/key UI missing | Flow exists only as service/tests | Tokens, join, keybox, revoke, recovery |
| 6 | Cache cleanup is only part of account wipe | No granular receipt/draft cache action | Documented; wipe exists |
| 7 | Independent security review | Composition unaudited | Audited Noble primitives; threat notes |
| 8 | Key recovery UX | Lost device needs a member online; no guided flow | `recoverForDevice` + tests |

No paid infrastructure was activated. Remote encrypted sync remains off.
