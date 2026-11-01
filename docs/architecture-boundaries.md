# BillLens — Architecture Boundaries

> Status: **Phase 1 · Prompt 2 complete (revised — capture intelligence + trust).**

## 1. Layered architecture

```
┌──────────────────────────────────────────────────────────┐
│                      Presentation                        │
│   Screens · Components · Forms · View Models · Trust UI  │
└────────────────────────────┬─────────────────────────────┘
                             │ calls
                             ▼
┌──────────────────────────────────────────────────────────┐
│                       Application                        │
│   Use Cases · Capture · Draft Review · Assignment ·      │
│   Confirm · Explain · Settle · Sync                      │
└────────────────────────────┬─────────────────────────────┘
                             │ depends on interfaces declared in
                             ▼
┌──────────────────────────────────────────────────────────┐
│                         Domain                           │
│  Entities · Value Objects · Services · Repository IFs ·  │
│  Ports (SecureStorage · CaptureProcessor) ·              │
│  Balance Engine · Settlement Engine · Split Engine ·     │
│  Item Assignment Engine · Explanation Engine ·           │
│  Confidence · Draft Lifecycle · Privacy Rules            │
└────────────────────────────▲─────────────────────────────┘
                             │ implements interfaces declared in
                             │
┌──────────────────────────────────────────────────────────┐
│                     Infrastructure                       │
│  SQLite · Supabase · Repositories · File Storage ·       │
│  SecureStore · Share Extension · Network & Sync ·        │
│  OCR Provider (ML Kit) · Capture Pipeline ·              │
│  Duplicate Detection · Analytics · Logging               │
└──────────────────────────────────────────────────────────┘
```

## 1.1. Capture Intelligence & Trust Rules (HARD ENFORCEMENT)

These rules are the core of BillLens's competitive advantage. They MUST be
enforced by architecture, not just by code review.

### Rule 1: OCR output CANNOT directly create an expense
```
CaptureSource → ExtractionResult → ExpenseDraft → [User Review] → Expense
```
The `CaptureProcessor` interface returns `ExtractionResult` ONLY. No
infrastructure service may call `ExpenseRepository.save` directly from OCR
output. The `ExpenseDraft` lifecycle (`processing → needs_review → ready →
confirmed`) enforces this — an `Expense` can only be created after the draft
is `confirmed` by the user.

### Rule 2: Capture services return extraction results only
The `CaptureProcessor` port (`src/domain/ports/capture-processor.port.ts`)
returns `ExtractionResult`. It does NOT return `Expense`, `ExpenseDraft`,
`PaymentEvidence`, or any financial record. The application layer creates
the draft from the extraction result.

### Rule 3: User confirmation is required before financial records are created
```
ExtractionResult → ExpenseDraft (status: needs_review)
                         ↓ (user edits + confirms)
                    ExpenseDraft (status: confirmed)
                         ↓ (use case creates)
                    Expense + ExpensePayer[] + ExpenseSplit[]
```
The `confirmExpenseDraft` function is the ONLY way to transition a draft to
`confirmed` status, and the application use case is the ONLY code that can
create an `Expense` from a confirmed draft.

### Rule 4: Explanation logic must remain independent from UI
The `Explanation Engine` (`src/domain/explanations/`) is a pure domain
service. It depends ONLY on:
- Balance engine output (`MemberBalance`, `BalanceResult`)
- Financial records (`Expense`, `Settlement`, `ExpenseSplit`)
- Domain value objects (`Money`, `CurrencyCode`, `DateTime`)

It does NOT import from:
- React, React Native, Expo
- Presentation layer
- Application layer
- Infrastructure layer

Explanations are built from verified financial records, NOT from uncontrolled
AI. The `BalanceExplanationService.explainMemberBalance()` function produces
deterministic, auditable explanations.

### Rule 5: Payment screenshots are evidence, not final expenses
`PaymentEvidence` is a distinct entity from `Expense`. A payment screenshot
proves money changed hands, but does NOT define:
- What the payment was for
- Which group it belongs to
- Who participated
- How it should be split

The user MUST confirm all of the above before an expense is created from
payment evidence. The `PaymentEvidence` entity header documents this:
"Payment evidence is NOT the same as a receipt."

### Rule 6: Privacy preferences control data flow
`ReceiptPrivacyPreference` determines:
- Whether the image is uploaded to the cloud (`requiresCloudUpload`)
- Whether the image is deleted after extraction (`shouldDeleteImageAfterExtraction`)
- Whether raw OCR text is retained (`shouldRetainRawText`)

The sync engine MUST NOT upload a receipt image when `storageMode` is
`local_only` or `delete_after_extraction`.

## 2. Layer responsibilities

The arrows in the diagram above are **dependency arrows**, not call arrows.
Infra calls happen at runtime, but the dependency direction always points
inward toward the domain.

### Presentation (`src/presentation/`, `app/`)

**Responsible for:**

- Rendering screens, components, forms
- Collecting user input and forwarding it to use cases
- Managing local view state (loading / empty / error / modal visibility)
- Navigation between routes
- View-model shaping for display

**Must NOT:**

- Call Supabase directly
- Query SQLite directly
- Parse receipts
- Calculate balances
- Resolve settlements
- Decide sync conflicts
- Import `@infrastructure/*` or `@services/*` directly

**Allowed imports:** React, React Native, Expo (router, status bar, etc.),
Zustand, TanStack Query, React Hook Form, Zod, `@application/*`, `@domain/*`
(read-models only).

### Application (`src/application/`)

**Responsible for:**

- Use cases (commands, queries)
- Orchestrating multiple repositories in a single transaction
- Mapping UI input → domain operations
- Mapping domain results → application DTOs

**Must NOT:**

- Import React, React Native, Expo, Zustand, TanStack Query
- Import `@infrastructure/*` or `@services/*` directly
- Import `@presentation/*`

**Allowed imports:** `@domain/*`, plus pure utility libraries (Zod for input
validation, date utilities, etc.). The concrete repository implementations
are *injected* at the composition root — the use case depends only on the
domain interface.

### Domain (`src/domain/`)

**Responsible for:**

- Entities (Group, Member, Expense, Settlement, Receipt, …)
- Value objects (Money, CurrencyCode, Percentage, BasisPoints, ShareUnits, …)
- Domain services (Balance Engine, Settlement Engine, Split Engine,
  Explanation Engine, Item Assignment Engine)
- Repository interface declarations
- Domain errors
- Business rule enforcement

**Must NOT import:**

- React, React Native, Expo (any package starting with `expo-` or `expo/`)
- Supabase (`@supabase/supabase-js`)
- SQLite (`expo-sqlite`)
- SecureStore, FileSystem
- Zustand, TanStack Query
- `@presentation/*`, `@application/*`, `@infrastructure/*`, `@services/*`,
  `@store/*`

**Allowed imports:** Pure TS/JS libraries that have no framework coupling.
Today: `zod` (validation), `@types/*` (shared branded types), `@utils/*`
(pure utilities), `@constants/*`. Any new external dep must be reviewed.

### Infrastructure (`src/infrastructure/`)

**Responsible for:**

- SQLite adapters and migrations
- Supabase adapters
- Concrete repository implementations
- File storage, secure storage
- Network status
- Notifications
- Analytics adapters
- Logging

**Must NOT:** (no hard restrictions on what it imports — but it must
implement domain interfaces, not invent new business rules)

**Allowed imports:** Everything. This is where framework coupling lives.

### Services (`src/services/`)

Cross-cutting technical services: capture intelligence, receipt parsing,
payment screenshot parsing, duplicate detection, image processing,
analytics. These are NOT business rules — they are technical capabilities
that the application layer orchestrates. Services implement interfaces
declared in domain where appropriate (e.g. `DuplicateExpenseDetector`).

## 3. ESLint enforcement

Boundary rules are enforced by `no-restricted-imports` in `.eslintrc.js`,
with `overrides` per layer. The rule definitions live inline in the config
file (CommonJS) for ESLint compatibility.

### Quick reference

| Layer | Files pattern | Forbidden modules | Forbidden paths |
|-------|---------------|-------------------|-----------------|
| Domain | `src/domain/**` | react, react-native, expo-*, zustand, @tanstack/react-query, @supabase/supabase-js, expo-sqlite, expo-secure-store, expo-file-system, @react-native-async-storage/async-storage | `@presentation/*`, `@application/*`, `@infrastructure/*`, `@services/*`, `@store/*` |
| Application | `src/application/**` | react, react-native, expo-*, zustand, @tanstack/react-query, @supabase/supabase-js, expo-sqlite, expo-secure-store, expo-file-system | `@presentation/*`, `@infrastructure/*`, `@services/*` |
| Presentation | `src/presentation/**`, `app/**` | @supabase/supabase-js, expo-sqlite, expo-secure-store, expo-file-system, @react-native-async-storage/async-storage | `@infrastructure/*`, `@services/*` |
| Infrastructure | `src/infrastructure/**` | (none — may import anything) | (none) |

### Running the boundary check

```bash
npm run lint              # full lint including boundary rules
npm run lint:boundaries   # boundary rules only (see package.json)
```

## 4. Barrel export policy

- Every layer has an `index.ts` barrel file (`src/<layer>/index.ts`).
- Barrels re-export only the **public API** of the layer. Internal helpers
  stay private.
- Cross-layer imports MUST go through barrels OR through fully-specified
  paths (both work — barrels are preferred for stable public API, fully-
  specified paths are preferred when you only need one symbol to avoid
  pulling in the whole barrel).
- Barrels must NOT create circular dependencies. If adding a symbol to a
  barrel would create a cycle, split the barrel.

## 5. Naming conventions

See `docs/naming-conventions.md` for the full table. Highlights:

| Kind | Pattern | Example |
|------|---------|---------|
| File — entity | `<entity-name>.ts` (singular, kebab-case) | `expense.ts`, `group-member.ts` |
| File — value object | `<name>.ts` (kebab-case) | `money.ts`, `currency-code.ts` |
| File — use case | `<verb>-<entity>.usecase.ts` | `add-expense.usecase.ts` |
| File — repository interface | `<entity>.repository.ts` | `expense.repository.ts` |
| File — repository impl | `<entity>.<impl>.repository.ts` | `expense.sqlite.repository.ts` |
| File — test | `<file-name>.test.ts` co-located in `__tests__/` | `money.test.ts` |
| Interface | `IFoo` is FORBIDDEN. Use `Foo` (no `I` prefix). | `ExpenseRepository` |
| Class | PascalCase | `Money`, `BalanceEngine` |
| Type alias | PascalCase | `ExpenseId`, `MinorUnit` |
| Branded primitive | `Branded<string, 'Foo'>` | `type GroupId = Branded<string, 'GroupId'>` |
| Function | camelCase | `calculateBalances`, `asGroupId` |
| Constant | UPPER_SNAKE_CASE for true constants | `MAX_RETRY_ATTEMPTS` |
| Enum | PascalCase type, PascalCase members | `SplitType.Equal` |

## 6. Module ownership

Each module has a single owning layer. If two layers both need a concept,
the concept lives in the **innermost** layer that needs it:

- `Money` is needed by domain (calculations) and infrastructure (storage
  mapping). → Lives in domain. Infrastructure imports it.
- `ExpenseRepository` interface is needed by domain (declarations) and
  application (use cases depend on it). → Lives in domain.
- `SQLiteTransaction` is needed only by infrastructure. → Lives in
  infrastructure.
- `GroupListItemView` is needed only by presentation. → Lives in
  presentation.
- `AddExpenseInputDTO` is needed by application and presentation (forms
  submit it). → Lives in application (the outer of the two).
- `captureImage()` is a technical capability. → Lives in services, exposed
  through an interface declared in application.

## 7. Composition root

The composition root (where concrete implementations are wired to
interfaces) lives in `src/infrastructure/composition-root.ts`
(**landed 2026-10-10**, v2.0.2 — balances, explanations, sync, capture,
and session buckets are wired and executed by
`src/infrastructure/__tests__/composition-root.test.ts`; **extended
v2.0.3** with the `repositories` bucket — production SQLite write-side
adapters for groups, group members, expenses (atomic aggregate save),
and expense drafts, each co-enqueuing its offline-sync operation inside
the entity-write transaction via `src/infrastructure/sqlite/sync-op-writer.ts`).
At that point, infrastructure may import application interfaces AND
instantiate concrete adapter implementations and pass them into use
cases.

The composition root is the **only** place where the application layer
sees concrete infrastructure classes. Everywhere else, use cases receive
their dependencies through constructor injection.

Because ESLint forbids presentation (including `app/**`) from importing
`@infrastructure/*`, the graph is published to the app through the
store-layer service locator `src/store/services-registry.ts`
(`initAppServices()` / `getAppServices()` / `tryGetAppServices()`),
booted once by `ServicesGate` in `app/_layout.tsx`. Screens consume
use cases through that registry — never adapters — so the boundary's
intent is preserved. (The `repositories` bucket is likewise consumed by
the application layer as its use cases land — presentation never touches
adapters directly.)

## 8. Testing the boundaries

Two automated checks enforce the boundaries:

1. **ESLint `no-restricted-imports`** — runs on every `npm run lint`.
2. **Domain-independence test** (`src/domain/__tests__/domain-independence.test.ts`)
   — a unit test that programmatically asserts the domain layer's files
   contain no `import` statements referencing forbidden modules.

The second check is a belt-and-suspenders defense: even if ESLint is
somehow bypassed (e.g. an editor saving without lint-on-save), the test
suite will fail in CI.

## 9. Allowed cross-layer flows

| From | To | Allowed? | Notes |
|------|----|---------|-------|
| Presentation | Application | ✅ | Use cases are the entry point |
| Presentation | Domain (read-models only) | ✅ | For pure type imports; never call domain services from a screen |
| Application | Domain | ✅ | Use cases depend on domain interfaces and entities |
| Infrastructure | Domain | ✅ | Infrastructure implements domain interfaces |
| Infrastructure | Application | ✅ | Only at composition root |
| Domain | Application | ❌ | Outer → inner only |
| Domain | Infrastructure | ❌ | Domain declares interfaces; never imports impls |
| Domain | Presentation | ❌ | Outer → inner only |
| Application | Presentation | ❌ | Data flows down |
| Application | Infrastructure | ❌ | Inject interfaces, not impls |
| Presentation | Infrastructure | ❌ | Use cases only |
| Presentation | Services | ❌ | Use cases only |
