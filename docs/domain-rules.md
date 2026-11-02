# BillLens — Domain Rules

> Status: **Phase 1 · Prompt 3 complete.**

This document catalogs the business rules enforced by the BillLens domain
layer. Every rule here is backed by either a constructor invariant, a
validation function, or a unit test.

## 1. Money rules

**Source:** `src/domain/value-objects/money.ts`

| # | Rule | Enforcement |
|---|------|-------------|
| M1 | Money is always an integer minor unit (e.g. ₹1 = 100 paise = `100` minor units) | `Money.fromMinor` validates with `Number.isInteger` |
| M2 | Money is always finite — no NaN, no Infinity | `Money.fromMinor` validates with `Number.isFinite` and `Number.isNaN` |
| M3 | Money is always within the safe integer range | `Money.fromMinor` validates with `Number.isSafeInteger` |
| M4 | Money is always paired with a currency code | The `Money` class has both `amountMinor` and `currency` as required fields |
| M5 | Arithmetic is only allowed between same-currency Money values | `add`, `subtract`, `isGreaterThan`, `isLessThan`, `sum` all throw `CurrencyMismatchError` |
| M6 | Allocation preserves the total exactly — `Σ shares = original` | `allocate` and `allocateByWeights` distribute remainder one minor unit at a time |
| M7 | Remainder distribution is deterministic — earliest indices receive the extra minor units | `allocate` allocates remainder to indices 0..remainder-1 |
| M8 | Weighted allocation distributes remainder by largest fractional share, tie-break by index ascending | `allocateByWeights` sorts by `(fraction DESC, index ASC)` |

## 2. CurrencyCode rules

**Source:** `src/domain/value-objects/currency-code.ts`

| # | Rule | Enforcement |
|---|------|-------------|
| C1 | Currency codes are 3-letter uppercase ISO 4217 codes | `asCurrencyCode` validates with `/^[A-Z]{3}$/` |
| C2 | Lowercase, mixed case, and 2/4-letter codes are rejected | Same regex |
| C3 | The list of supported currencies is bounded for Phase 1 (12 common codes) | `SUPPORTED_CURRENCIES` constant in `src/domain/entities/currency.ts` |

## 3. Group rules

**Source:** `src/domain/entities/group.ts`

| # | Rule | Enforcement |
|---|------|-------------|
| G1 | Group name must be non-empty after trim | `validateGroupName` throws `EmptyValueError` |
| G2 | Group name must be ≤ 100 chars | `validateGroupName` throws `ValueTooLongError` |
| G3 | Group description must be ≤ 500 chars | `validateGroupDescription` throws `ValueTooLongError` |
| G4 | Group currency must be a valid CurrencyCode | `asCurrencyCode` is called in `createGroup` |
| G5 | Soft-delete sets `deletedAt` and increments `version` | `softDeleteGroup` |
| G6 | Soft-deleted groups cannot be updated | `updateGroup` throws if `deletedAt` is set |
| G7 | Soft-deleted groups cannot be soft-deleted again | `softDeleteGroup` throws if already deleted |
| G8 | All mutations require `expectedVersion` matching the current `version` | `updateGroup`, `softDeleteGroup` |

## 4. GroupMember rules

**Source:** `src/domain/entities/group-member.ts`

| # | Rule | Enforcement |
|---|------|-------------|
| GM1 | Display name must be 1–80 chars after trim | `asDisplayName` throws `EmptyValueError` or `ValueTooLongError` |
| GM2 | Role is one of `owner`, `admin`, `member` | `MemberRole` type |
| GM3 | Leaving a group sets `leftAt` and preserves the record (soft-delete) | `leaveGroup` |
| GM4 | A member who has left cannot leave again | `leaveGroup` throws `DeletedEntityError` |
| GM5 | A member who has left cannot have their role changed | `changeMemberRole` throws `DeletedEntityError` |
| GM6 | The owner role cannot be revoked directly — ownership must be transferred first | `changeMemberRole` throws when demoting an owner |
| GM7 | `wasMemberActiveAt(member, asOf)` returns true only if joined before asOf and not left before asOf | `wasMemberActiveAt` function |

## 5. GroupInvite rules

**Source:** `src/domain/entities/group-invite.ts`

| # | Rule | Enforcement |
|---|------|-------------|
| I1 | `expiresInDays` must be a positive integer ≤ 30 | `createGroupInvite` validates |
| I2 | Only `pending` invites can be accepted or revoked | `acceptGroupInvite`, `revokeGroupInvite` throw otherwise |
| I3 | Expired invites cannot be accepted | `acceptGroupInvite` checks `expiresAt <= now` |
| I4 | `isInviteUsable` returns true only if status is `pending` AND not expired | `isInviteUsable` function |

## 6. Expense rules

**Source:** `src/domain/entities/expense.ts`

| # | Rule | Enforcement |
|---|------|-------------|
| E1 | Expense title must be non-empty after trim, ≤ 200 chars | `validateExpenseTitle` |
| E2 | Expense amount must be a positive integer minor unit | `validateExpenseAmount` |
| E3 | Expense amount cannot be zero (zero-value adjustments are a separate Phase 2 record type) | `validateExpenseAmount` |
| E4 | Expense amount cannot be negative | `validateExpenseAmount` |
| E5 | Expense amount must be a safe integer | `validateExpenseAmount` |
| E6 | Expense date must be a valid ISO 8601 UTC string | `asDateTime` called in `createExpense` |
| E7 | Expense currency must be a valid CurrencyCode | `asCurrencyCode` called in `createExpense` |
| E8 | Split type is one of `equal`, `exact`, `percentage`, `shares`, `items` | `SplitType` type |
| E9 | Note must be ≤ 1000 chars | `validateExpenseNote` |
| E10 | Category must be ≤ 50 chars | `validateExpenseCategory` |
| E11 | Soft-delete preserves history; deleted expenses excluded from active balances | `softDeleteExpense` |
| E12 | Editing an expense recalculates balances (in balance engine, Prompt 5) | `updateExpense` increments version |

## 7. ExpensePayer rules

**Source:** `src/domain/entities/expense-payer.ts`

| # | Rule | Enforcement |
|---|------|-------------|
| P1 | Payer amount must be a non-negative integer | `createExpensePayer` |
| P2 | Payer amount must be a safe integer | `createExpensePayer` |
| P3 | Sum of payer amounts must equal expense total | `validatePayerTotal` throws `PayerTotalMismatchError` |

## 8. ExpenseSplit rules

**Source:** `src/domain/entities/expense-split.ts`

| # | Rule | Enforcement |
|---|------|-------------|
| S1 | Split amount must be a non-negative integer | `createExpenseSplit` throws `InvalidSplitError` |
| S2 | `percentageBasisPoints` must be in [0, 10000] | `createExpenseSplit` |
| S3 | `shareUnits` must be a positive integer | `createExpenseSplit` |
| S4 | Sum of split amounts must equal expense total | `validateSplitTotal` throws `InvalidSplitError` |
| S5 | For percentage splits, sum of `percentageBasisPoints` must equal 10,000 | `validatePercentageTotal` |
| S6 | For share splits, every `shareUnits` must be positive | `validateShareUnits` |
| S7 | No two splits for the same expense may reference the same member | `validateNoDuplicateMembers` |

## 9. Receipt rules

**Source:** `src/domain/entities/receipt.ts`

| # | Rule | Enforcement |
|---|------|-------------|
| R1 | Merchant name must be ≤ 200 chars | `createReceipt` |
| R2 | Total amount (if provided) must be a non-negative integer | `createReceipt` |
| R3 | Privacy preference is always set (defaults: `local_only`, `retainRawText: false`, `retainSourceImage: true`, `retentionDays: 30`) | `DEFAULT_PRIVACY_PREFERENCE` |
| R4 | Storage mode is one of `local_only`, `cloud_private`, `shared_with_group`, `delete_after_extraction` | `StorageMode` type |

## 10. ReceiptItem rules

**Source:** `src/domain/entities/receipt-item.ts`

| # | Rule | Enforcement |
|---|------|-------------|
| RI1 | Item name must be non-empty after trim, ≤ 200 chars | `createReceiptItem` |
| RI2 | Quantity must be a positive integer | `createReceiptItem` |
| RI3 | Unit price must be a non-negative integer | `createReceiptItem` |
| RI4 | Discount must be a non-negative integer | `createReceiptItem` |
| RI5 | Tax must be a non-negative integer | `createReceiptItem` |
| RI6 | Item total = (quantity × unitPrice) − discount + tax, must be ≥ 0 | `computeItemTotal` |
| RI7 | Sum of item totals must equal receipt total | `validateReceiptItemTotal` |

## 11. Settlement rules

**Source:** `src/domain/entities/settlement.ts`

| # | Rule | Enforcement |
|---|------|-------------|
| SE1 | `fromMemberId` cannot equal `toMemberId` | `createSettlement` throws `InvalidEntityError` |
| SE2 | Settlement amount must be a positive integer | `createSettlement` |
| SE3 | Settlement amount must be a safe integer | `createSettlement` |
| SE4 | Settlement currency must be a valid CurrencyCode | `asCurrencyCode` called in `createSettlement` |
| SE5 | Method is one of `cash`, `upi`, `bank_transfer`, `other` | `SettlementMethod` type |
| SE6 | Soft-deleting a settlement preserves history | `softDeleteSettlement` |
| SE7 | Cannot soft-delete twice | `softDeleteSettlement` throws `DeletedEntityError` |
| SE8 | Reversing a settlement uses a new adjustment record (Phase 2), never mutation | Documented in entity header |

## 12. User & GuestIdentity rules

**Source:** `src/domain/entities/user.ts`, `src/domain/entities/guest-identity.ts`

| # | Rule | Enforcement |
|---|------|-------------|
| U1 | User displayName must be 1–80 chars | `asDisplayName` |
| U2 | User email must be valid format and lowercase | `asEmailAddress` |
| U3 | Email must be ≤ 254 chars (RFC 5321) | `asEmailAddress` |
| U4 | Guest identity has a `deviceSecretHash` (not the secret itself) | `GuestIdentity` interface |
| U5 | Guest upgrade status transitions: `local_only → upgrade_pending → upgrade_in_progress → upgraded` (or `upgrade_failed`) | `startGuestUpgrade`, `completeGuestUpgrade` |
| U6 | Cannot start upgrade on already-upgraded identity | `startGuestUpgrade` throws |
| U7 | `linkedUserId` is set only when `upgradeStatus === 'upgraded'` | `completeGuestUpgrade` |

## 13. VersionNumber rules

**Source:** `src/domain/value-objects/version-number.ts`

| # | Rule | Enforcement |
|---|------|-------------|
| V1 | Version numbers are positive integers starting at 1 | `asVersionNumber` |
| V2 | Initial version is always 1 | `initialVersionNumber` |
| V3 | `nextVersionNumber` increments by 1 and checks for safe-integer overflow | `nextVersionNumber` |

## 14. Sync metadata rules

**Source:** `src/domain/entities/sync-metadata.ts`

| # | Rule | Enforcement |
|---|------|-------------|
| SM1 | `cloudVersion` starts at 0 (no cloud sync yet) | `INITIAL_SYNC_METADATA` |
| SM2 | `hasPendingChanges` is true initially (local data not yet synced) | `INITIAL_SYNC_METADATA` |
| SM3 | `createPendingSyncMetadata` preserves `cloudVersion` and `lastSyncedAt` from previous | `createPendingSyncMetadata` |
| SM4 | `createSyncedSyncMetadata` clears `hasPendingChanges` and sets `lastSyncedAt` | `createSyncedSyncMetadata` |

## 15. Domain independence rules

**Source:** `src/domain/__tests__/domain-independence.test.ts`, `docs/architecture-boundaries.md`

| # | Rule | Enforcement |
|---|------|-------------|
| D1 | Domain files must not import React, React Native, Expo, Supabase, SQLite, Zustand, TanStack Query, SecureStore, FileSystem, AsyncStorage | ESLint `no-restricted-imports` + programmatic test |
| D2 | Domain files must not import from `@presentation`, `@application`, `@infrastructure`, `@services`, `@store` | Same |
| D3 | All financial calculations happen in the domain layer, never in screens or UI components | Architectural rule enforced by review + boundary tests |

## 16. Branded ID rules

**Source:** `src/types/index.ts`

| # | Rule | Enforcement |
|---|------|-------------|
| B1 | Every entity has its own branded ID type (`GroupId`, `ExpenseId`, …) | Branded types in `shared-types` |
| B2 | Branded IDs are erased at runtime — they are just strings | Phantom brand property |
| B3 | `as<Id>()` constructor functions exist for each ID type | One per entity file |
| B4 | Mixing ID types at compile-time is a TypeScript error | Branded types prevent this |
