# BillLens — agent & contributor rules

## Architecture

- Layers: `src/domain` → `src/application` → `src/infrastructure` → `src/presentation`; `app/` routes are thin.
- Domain has no React/Expo/network imports. Application may not import infrastructure (tests included).
- SQLite is the primary store; Supabase and the encrypted relay are optional. Never block local use on cloud init.

## Quality gates (must pass)

```bash
npm run typecheck
npm run lint
npm test
npm run db:verify
npm run secret-scan
npx expo-doctor
npx expo export -p web
```

## Performance & lazy-loading

Follow `docs/PERFORMANCE_AND_LAZY_LOADING_STANDARDS.md`:

- no heavy feature imports in `app/_layout.tsx` or route files;
- optional services (OCR, sync clients, export, reports) created lazily;
- lists virtualised and paginated; new queries need a matching index;
- media thumbnails in lists, full resolution on demand;
- measure before/after; state build type and device;
- never defer validation required for a financial operation.

## Security & data

- Never log or export tokens, keys, receipt text or full financial payloads.
- Encrypted-sync changes must keep `docs/ENCRYPTED_SYNC_PROTOCOL.md` true.
- Destructive actions require guards + audit; retention never auto-deletes.
