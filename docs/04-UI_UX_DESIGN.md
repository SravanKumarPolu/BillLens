> **BillLens v2.25.0 | Repository-grounded documentation audit | 2026-10-23**  \n> Source snapshot: `BillLens(5).zip`. Statuses describe source inspection and previously documented tests; **no native device tests were executed during this audit**.  \n> These consolidated files supersede conflicting planning claims; historical files remain available.

# UI/UX design brief

## Existing design system
Source of truth: `src/presentation/design-system/tokens.ts`, `docs/design-system.md` and implemented components. Style: calm, minimal, high-contrast, legible financial data; avoid heavy visual effects that slow capture or obscure balances.

## Tokens and visual hierarchy
Typography uses display 36/700, screen title 28/700, section title 20/600, card title 16/600, body 15/400 and caption 13/400 (see tokens for authoritative values). Spacing xs 4, sm 8, md 12, lg 16, xl 20, xxl 24, xxxl 32. Touch targets at least 44 pt. Semantic colours positive/negative/warning/critical/info; show text labels and signs in addition to colour. Amounts use tabular numerals, explicit currency and locale-aware minor-unit precision.

## Layouts and components
Theme modes light/dark/system, persisted preference; safe-area-aware screen and modal containers; form labels/error messages; skeletons and empty states; accessible buttons, cards, badges, amount text and status dots. See actual design-system implementation rather than inventing palette hex values.

## Capture and finance UX
Show source (camera/gallery), image preview, crop/quality feedback, OCR confidence per field and editable draft. Never auto-post. Manual entry is always available as fallback. Split editor must show exact totals and remainder allocation. Settlement screen distinguishes proposed, pending, confirmed and reversed; payment evidence is not proof.

## Offline and sync UX
Show **local saved**, **queued**, **delivered**, **conflict**, and **not configured** as different states. Never imply automatic group sync is operational before relay/app wiring and device verification. Retention prompts must be informative, not destructive. Handle permissions denied and unsupported native APIs gracefully.

## Accessibility and responsive checks
Screen reader names/hints, dynamic text, contrast, keyboard focus on web, Android back behaviour, minimum targets, reduce-motion settings, and 320px narrow layouts. These are design requirements, not completed accessibility certification.
