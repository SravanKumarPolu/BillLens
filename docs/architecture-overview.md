# BillLens — Architecture Overview

> Status: **Phase 1 · All 10 prompts complete (audited and reviewed).**
> This document grows as architecture prompts (1–10) are completed.

## 1. Purpose

BillLens is an offline-first, receipt-aware shared-expense application for
friends, roommates, couples, families, and travel groups. The product flow
is built around three pillars:

1. **Capture intelligence** — paper receipts, gallery images, UPI / card /
   bank payment screenshots, digital invoices, and shared images all flow
   through a unified pipeline that classifies, extracts, and confidence-rates
   each field.
2. **User verification** — extracted data is never auto-accepted. Every
   captured document becomes an editable `ExpenseDraft` that the user reviews
   and confirms before it becomes an `Expense`.
3. **Transparent explanations** — balances, settlements, and the rationale
   behind each suggestion are explained in human-readable form by the
   Explanation Engine.

## 2. Layered architecture

```
Presentation
      ↓
Application
      ↓
Domain
      ↑
Infrastructure implements domain interfaces
```

| Layer | Responsibility | Forbidden imports |
|-------|---------------|-------------------|
| **Presentation** | Screens, components, forms, navigation, view state | Supabase, SQLite, receipt parsers, balance calc, settlement resolution |
| **Application** | Use cases, commands, queries, transaction boundaries, UI→domain mapping | React, React Native, Expo, Supabase direct calls |
| **Domain** | Entities, value objects, business rules, repository interfaces, financial calculations, balance / settlement / explanation engines | React, React Native, Expo, Supabase, SQLite, Zustand, TanStack Query |
| **Infrastructure** | Concrete adapters (SQLite, Supabase, OCR, file storage, secure storage, share extension, analytics) | — |

## 3. Tech stack

| Layer | Technology |
|-------|-----------|
| Mobile | React Native + Expo + TypeScript + Expo Router + Reanimated |
| Forms | React Hook Form + Zod |
| Local state | Zustand (ephemeral UI state only) |
| Server cache | TanStack Query |
| Local store | Expo SQLite (durable source of truth) + SecureStore + FileSystem |
| Cloud | Supabase (Postgres, Auth, Storage, Realtime, Edge Functions) |
| Receipt intelligence | Google ML Kit OCR + custom parsers + confidence engine |
| Tests | Jest + React Native Testing Library + Maestro |
| Quality | ESLint + Prettier + TypeScript strict + Husky |

## 4. Folder structure

```
billlens/
├── app/                  # Expo Router routes (thin screens)
├── src/
│   ├── presentation/     # UI components, screens, forms, view-models
│   ├── application/      # Use cases, commands, queries
│   ├── domain/           # Entities, value objects, business rules
│   ├── infrastructure/   # SQLite, Supabase, OCR adapters, file storage
│   ├── services/         # Capture intelligence, parsers, analytics
│   ├── store/            # Zustand stores (ephemeral UI state)
│   ├── config/           # Env validation, app metadata
│   ├── constants/        # App-wide constants
│   ├── types/            # Shared branded types
│   └── utils/            # Pure utility functions
├── supabase/             # Migrations, functions, seed, config.toml
├── e2e/                  # Maestro flow YAMLs
├── assets/               # Icons, splash, images
├── scripts/              # Build / dev scripts
└── docs/                 # Architecture documentation
```

## 5. Hard rules (enforced by lint + review)

1. Money is always integer minor units. Never floating point.
2. Domain layer has zero framework imports.
3. Screens never call Supabase or SQLite directly.
4. Receipt data is never auto-accepted; the user always reviews a draft.
5. Payment screenshots are evidence, not expenses.
6. Duplicate detection warns; it never blocks.
7. Service-role keys never enter the mobile app.
8. Sensitive tokens always live in SecureStore.
9. Client-generated UUIDs for all offline-created records.
10. Soft deletion preserves financial history — never hard-delete.

## 6. Phase 1 prompt roadmap

| # | Prompt | Status |
|---|--------|--------|
| 1 | Project Bootstrap & Technical Baseline | ✅ Complete |
| 2 | Architecture Boundaries & Dependency Rules | ✅ Complete |
| 3 | Core Domain Models & Value Objects | ✅ Complete |
| 4 | Split Calculation & Rounding Rules | ✅ Complete |
| 5 | Balance Engine & Settlement Foundation | ✅ Complete |
| 6 | Database Schema & Supabase Migrations | ✅ Complete |
| 7 | Repository Interfaces & Data Access Contracts | ✅ Complete |
| 8 | Offline-First SQLite & Sync Queue Architecture | ✅ Complete |
| 9 | Guest Identity, Auth & Data Upgrade Architecture | ✅ Complete |
| 10 | Phase 1 Architecture Audit & Foundation Hardening | ✅ Complete |

## 7. What Prompt 1 delivers

The technical baseline only:

- ✅ Project bootstrap (Expo + TypeScript strict + path aliases)
- ✅ ESLint + Prettier + Jest + RNTL config
- ✅ `.env.example` + typed env validation (Zod) with `parseEnv` (pure) and `getEnv` (cached)
- ✅ Folder structure with layer boundaries marked by barrel files
- ✅ Minimal startup screen showing app name + env + Supabase URL + dev-only architecture status
- ✅ Unit tests for env validation and shared utilities
- ✅ Supabase local config (`supabase/config.toml`)
- ✅ Maestro e2e folder structure

What Prompt 1 deliberately does NOT do:

- ❌ No domain logic (deferred to Prompt 3)
- ❌ No ESLint cross-layer import restrictions (deferred to Prompt 2)
- ❌ No Supabase migrations (deferred to Prompt 6)
- ❌ No SQLite schema (deferred to Prompt 8)
- ❌ No real screens beyond the startup screen
- ❌ No fake user / group / expense / balance data (per spec)

## 8. Environment configuration

### Public (safe for the mobile bundle, scoped by RLS)

- `EXPO_PUBLIC_APP_ENV` — `development` | `staging` | `production`
- `EXPO_PUBLIC_SUPABASE_URL` — Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon public key

### Private (NEVER in the mobile app)

- Supabase service-role keys
- Private OCR credentials
- Database admin credentials
- JWT signing secrets
- Any key with "secret", "service", "admin", or "private" in the name

These belong only in Supabase Edge Functions and other server-side
environments. See `.env.example` for the full policy.
