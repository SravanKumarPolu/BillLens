# Open-source Licences Notice — BillLens

> Phase 8, Prompt 78 ("Open-source licences notice"). BillLens is built
> on open-source software. This notice lists the direct dependencies of
> this build. Regenerate/verify at each release (licences can change
> between major versions) — a lockfile-derived SBOM should accompany
> the release artefacts.

## Runtime dependencies (ship in the app)

| Package | Version (2.0.0) | Licence | Copyright / Notice |
|---|---|---|---|
| @react-native-async-storage/async-storage | 1.23.1 | MIT | (c) 2015-present, Facebook, Inc. / contributors |
| @supabase/supabase-js | ^2.45.0 | MIT | (c) 2020 Supabase |
| @tanstack/react-query | ^5.51.0 | MIT | (c) TanStack / MIT contributors |
| expo (SDK + modules: camera, constants, crypto, file-system, image-picker, linking, router, secure-store, sqlite, status-bar) | ~51.x | MIT | (c) 650 Industries, Inc. (Expo) |
| react | 18.2.0 | MIT | (c) Meta Platforms, Inc. and affiliates |
| react-hook-form | ^7.52.0 | MIT | (c) Beier (Bill) Luo |
| react-native | 0.74.5 | MIT | (c) Meta Platforms, Inc. and affiliates |
| react-native-reanimated | ~3.10.1 | MIT | (c) Software Mansion |
| react-native-safe-area-context | 4.10.5 | MIT | (c) Janic Duplessis / contributors |
| react-native-screens | 3.31.1 | MIT | (c) Software Mansion |
| zod | ^3.23.8 | MIT | (c) Colin McDonnell |
| zustand | ^4.5.4 | MIT | (c) Poimandres |

## Build / test tooling (not shipped in the app)

@babel/core, @testing-library/jest-native, @testing-library/react-native,
@types/jest, @types/react, @typescript-eslint/*, eslint *,
eslint-config-expo, eslint-config-prettier, husky, jest, jest-expo,
prettier, typescript — MIT-licensed.

## Verification commands

```bash
npx license-checker --summary        # full transitive summary
npx license-checker --production --files  # per-package licence texts
```

(Add `license-checker` as a devDependency when the release SBOM step is
enabled in CI.)

MIT licence summary (for the MIT-licensed packages above): permission
is granted, free of charge, to use, copy, modify, merge, publish,
distribute, sublicense and/or sell copies — subject to the copyright
and permission notice being included in all copies or substantial
portions. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
KIND. Full texts are bundled with each package (`node_modules/<pkg>/LICENSE`).
