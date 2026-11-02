# BillLens — Naming Conventions

> Status: **Phase 1 · Prompt 2 complete.**

## 1. General principles

1. **Names describe behavior, not implementation.** A function that
   calculates balances is `calculateBalances`, not `runBalanceSql` or
   `doBalanceStuff`.
2. **No abbreviations** except well-known ones: `id`, `url`, `api`, `ocr`,
   `dto`, `vo`. Spell out `expense`, `settlement`, `repository`.
3. **Singular for entities, plural for collections.** `Expense` (one) →
   `Expense[]` (many). `ExpensesRepository` is wrong; `ExpenseRepository`
   is right.
4. **No `I` prefix on interfaces.** Use `ExpenseRepository`, not
   `IExpenseRepository`. Implementations are suffixed by adapter:
   `SqliteExpenseRepository`, `SupabaseExpenseRepository`.
5. **Branded primitives are types, not classes.** `type GroupId =
   Branded<string, 'GroupId'>`. Constructor functions are `asX(value)`:
   `asGroupId('abc')`.

## 2. File naming

| Kind | Pattern | Example |
|------|---------|---------|
| Entity | `<entity-name>.ts` (singular, kebab-case) | `expense.ts`, `group-member.ts` |
| Value object | `<name>.ts` (kebab-case) | `money.ts`, `currency-code.ts` |
| Domain service | `<name>.service.ts` | `balance-engine.service.ts` |
| Use case | `<verb>-<entity>.usecase.ts` | `add-expense.usecase.ts`, `list-expenses-by-group.usecase.ts` |
| Query | `<verb>-<entity>.query.ts` | `get-group-summary.query.ts` |
| Command | `<verb>-<entity>.command.ts` | `record-settlement.command.ts` |
| Repository interface | `<entity>.repository.ts` | `expense.repository.ts` |
| Repository implementation | `<entity>.<adapter>.repository.ts` | `expense.sqlite.repository.ts`, `expense.supabase.repository.ts` |
| Domain error | `<name>.error.ts` | `invalid-money.error.ts` |
| View model | `<name>.view-model.ts` | `group-list-item.view-model.ts` |
| Screen | `<screen-name>.tsx` | `group-list-screen.tsx` |
| Component | `<component-name>.tsx` (PascalCase filename for components) | `ExpenseCard.tsx`, `MoneyInput.tsx` |
| Hook | `use-<name>.ts` | `use-add-expense.ts` |
| Store | `<name>.store.ts` | `current-group.store.ts` |
| Test | `<file-name>.test.ts` (co-located in `__tests__/`) | `money.test.ts` |
| Test fixture | `<name>.fixture.ts` | `expense.fixture.ts` |
| Type definitions | `<name>.types.ts` or `<name>.ts` if it's only types | `sync.types.ts` |
| Barrel | `index.ts` | `index.ts` |
| Migration | `<timestamp>_<short-name>.sql` | `20260729_0001_create_groups.sql` |
| Maestro flow | `<flow-name>.yaml` (kebab-case) | `add-expense-manual.yaml` |

## 3. TypeScript naming

| Kind | Convention | Example |
|------|-----------|---------|
| Class | PascalCase | `Money`, `BalanceEngine` |
| Interface | PascalCase, no `I` prefix | `ExpenseRepository`, `BalanceExplanation` |
| Type alias | PascalCase | `ExpenseId`, `MinorUnit`, `ISODateString` |
| Enum | PascalCase type, PascalCase members | `SplitType.Equal`, `PaymentStatus.Success` |
| Function | camelCase | `calculateBalances`, `asGroupId` |
| Function that returns a branded primitive | `as<Brand>` | `asGroupId('abc')`, `asMinorUnit(1250)` |
| Constant | UPPER_SNAKE_CASE for true constants | `MAX_RETRY_ATTEMPTS`, `DEFAULT_CURRENCY_CODE` |
| Local variable | camelCase | `groupBalance`, `expenseDate` |
| Private class member | camelCase, no underscore prefix | `private readonly expenses` (not `_expenses`) |
| Readonly | Prefer `readonly` modifier over naming | `readonly id: GroupId` |
| Generic type parameter | Single letter or descriptive PascalCase | `T`, `TInput`, `TOutput` |

## 4. Database naming

| Kind | Convention | Example |
|------|-----------|---------|
| Table | snake_case, plural | `groups`, `expense_splits`, `receipt_items` |
| Column | snake_case | `created_at`, `amount_minor`, `currency_code` |
| Primary key | `id` (UUID) | `id UUID PRIMARY KEY` |
| Foreign key | `<referenced-table-singular>_id` | `group_id`, `expense_id` |
| Timestamps | `*_at` suffix, timestamptz | `created_at`, `updated_at`, `deleted_at` |
| Boolean | `is_*` or `has_*` prefix | `is_deleted`, `has_receipt` |
| Index | `idx_<table>_<columns>` | `idx_expenses_group_id_date` |
| Unique constraint | `uq_<table>_<columns>` | `uq_group_members_group_id_user_id` |
| Foreign key constraint | `fk_<table>_<column>` | `fk_expenses_group_id` |
| Check constraint | `ck_<table>_<rule>` | `ck_expenses_amount_positive` |
| Migration file | `<YYYYMMDDHHMM>_<name>.sql` | `202607291200_create_groups.sql` |

## 5. Test naming

| Kind | Convention | Example |
|------|-----------|---------|
| Test file | `<unit-name>.test.ts` | `money.test.ts` |
| `describe` block | The unit name or a scenario | `Money.add`, `EqualSplit (3 members, ₹10)` |
| `it` block | A sentence describing the behavior, no "should" prefix | `adds two money values with matching currency`, `throws when currencies differ` |
| Test variable | `actual` / `expected` for assertion clarity | `const actual = ...; expect(actual).toBe(expected);` |
| Setup helper | `given*` / `when*` / `then*` for BDD style | `givenAnExpense()`, `whenCalculated()`, `thenBalancesShouldBe(...)` |

## 6. Import order

Enforced by ESLint `import/order`:

1. Built-in Node modules (`fs`, `path`, `crypto`)
2. External packages (`react`, `expo`, `@supabase/supabase-js`)
3. Internal aliases (`@domain/*`, `@application/*`)
4. Parent directories (`../`)
5. Sibling files (`./`)
6. Index files (`./index`)

Each group separated by a blank line. Within each group, sorted
alphabetically (case-insensitive).

## 7. Comments

- Use `//` for line comments, `/* */` only for license headers.
- Comments explain **why**, not **what**. If you need to explain what, the
  code is unclear — refactor first.
- JSDoc on every exported function and class. At minimum: a one-line
  description, `@param`, `@returns`, and `@throws` when applicable.
- `TODO` and `FIXME` must include a ticket reference or a date+initials:
  `// TODO(prompt-7): implement SQLite adapter`.

## 8. Forbidden names

| Forbidden | Use instead |
|-----------|-------------|
| `data`, `info`, `value` (as variable names) | `expense`, `member`, `amount` |
| `tmp`, `temp` | `scratch`, `pending` |
| `helper`, `util` (as file names without specificity) | `money-arithmetic.ts`, `date-format.ts` |
| `Manager`, `Handler`, `Processor` (as class suffixes) | Use a verb: `Calculator`, `Engine`, `Resolver` |
| `IEntity` interface prefix | `Entity` (drop the `I`) |
| `EntityImpl` implementation suffix | `SqliteEntityRepository`, `SupabaseEntityRepository` |
| `Any` in a type name | Use a specific name: `UnknownExpense` |
| `foo`, `bar`, `baz` in production code | Real domain words |
