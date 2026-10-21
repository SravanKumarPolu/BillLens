# Performance & lazy-loading standards

Applies to every new feature in BillLens. The goal is a fast first screen,
bounded memory, and no regression in offline/financial correctness.

## Budgets

| Metric | Budget | How it is checked |
|---|---|---|
| Web entry gzip | ≤ 650 KB | `npx expo export -p web`, measure `entry-*.js` |
| Optional feature code | own async chunk | dynamic `import()` in infra, verified in export output |
| Expense list query (5k rows, limit 20) | ≤ 2 ms on desktop SQLite | indexed plan + benchmark |
| Boot before first screen | SQLite + migrations + providers only | code review of `ServicesGate` / `productionFactory` |
| New list | virtualised, paginated | code review / test |

Current measured baseline (2026-10-21, production export, Node benchmark):
web entry **602,526 B (≈588 KB) gzip**, OCR selector **6.8 KB separate chunk**, Android
Hermes **4.7 MB**, iOS Hermes **4.5 MB**, indexed 5k-row expense query **0.072 ms** vs **1.367 ms**
without the `(group_id, expense_date desc)` index.

## Rules

1. **Keep features modular.** Domain → application → infrastructure →
   presentation. A feature's heavy code lives in its own module, not in a
   root layout, route file, or shared barrel.
2. **No eager root imports.** `app/_layout.tsx` and route files import only
   what the first paint needs. Do not import a feature barrel that pulls
   unrelated screens or native modules.
3. **Defer expensive optional services.** OCR provider, relay/sync clients,
   export, reports, analytics and backup must be created on demand (or after
   `InteractionManager.runAfterInteractions`). SQLite is *not* deferred: the
   active screen needs it.
4. **Load data incrementally.** Cursor/limit queries only. Never `select *`
   over a full history for a list; add a composite index for the sort key.
5. **Virtualise lists.** `FlatList`/`FlashList` for anything unbounded.
   Provide `keyExtractor`, `initialNumToRender`, `windowSize`, and stable
   item components (`React.memo` where profiling shows a win).
6. **Media on demand.** List rows use thumbnails; full-resolution images load
   only in detail/review. Respect `CAPTURE_CONFIG.maxImageDimension`; release
   base64 buffers after OCR.
7. **Avoid unnecessary renders.** Memoise pure transforms, keep store
   selectors narrow, split container (data) from view (pure). Don't memoise
   by default without a measured reason.
8. **Profile first.** Use React DevTools/Profiler, `expo start --no-dev
   --minify`, Android Studio profiler, or `performance.now()` marks. Record
   device, build type and numbers; do not present dev-mode timings as
   production results.
9. **Preserve correctness.** Optimisations must not change offline writes,
   migrations, the sync queue, encrypted-event processing, conflict handling
   or financial invariants. Security validation is never deferred when an
   operation needs it.
10. **Add regression guards.** Bundle-size assertions in CI, query-plan tests,
    and list-render tests where practical.

## Patterns

**Lazy optional service** (see `LazyCaptureProcessor`):

```ts
const lazy = new LazyCaptureProcessor(async () => {
  const { resolveOcrProvider } = await import('@infrastructure/capture/ocr-provider-selector');
  return resolveOcrProvider(options);
});
// inject `lazy`; resolve on first use or after interactions
await lazy.resolve();
```

- Web export creates a separate chunk for the dynamic import.
- Native still ships one bundle: `import()` defers **evaluation**, it does not
  create separately downloadable native bundles. Do not claim otherwise.

**List screen**:

```tsx
<Screen safeArea>
  <FlatList
    data={page.items}
    keyExtractor={(item) => item.id}
    renderItem={({ item }) => <MemoRow item={item} />}
    initialNumToRender={12}
    maxToRenderPerBatch={12}
    windowSize={7}
  />
</Screen>
```

## Review checklist (paste into the PR)

- [ ] No new import in `app/_layout.tsx` or route files beyond first paint
- [ ] Optional heavy module behind dynamic import / lazy proxy
- [ ] New query has a limit and an index matching its sort
- [ ] New list is virtualised and keyed
- [ ] Images limited/thumbnailed; buffers released
- [ ] Memoisation only where measured
- [ ] Bundle size measured (before/after)
- [ ] Offline + sync + migration tests still pass
- [ ] Numbers recorded with build type and device

## Known limitations

- Native bundle splitting is not available in this Expo setup; only evaluation
  is deferred.
- Device cold/warm startup has not been profiled on hardware in this
  environment; only bundle size, chunking, query plans and Node benchmarks are
  measured.
- Receipt thumbnails are not implemented yet; image output is already bounded
  by `CAPTURE_CONFIG` (2048 px, 0.8 quality).
