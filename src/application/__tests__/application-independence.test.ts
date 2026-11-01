/**
 * Application layer independence test.
 *
 * Asserts that every TypeScript file under `src/application/` contains no
 * `import ... from` statements referencing frameworks (React, Expo,
 * Supabase, SQLite) or infrastructure/services/presentation layers.
 *
 * Application layer may import:
 *   - @domain/* (entities, value objects, repository interfaces, errors)
 *   - @shared-types/* (branded ID types)
 *   - @constants/* (app constants — pure)
 *   - @utils/* (pure utilities)
 *   - @jest/globals + node:* (in test files only)
 *   - zod (pure validation library, no framework coupling)
 *
 * Application layer must NOT import:
 *   - React, React Native, Expo (any package)
 *   - @supabase/supabase-js
 *   - expo-sqlite, expo-secure-store, expo-file-system
 *   - zustand, @tanstack/react-query, react-hook-form
 *   - @config/* (config reads process.env — application must be env-agnostic)
 *   - @infrastructure/*, @services/*, @presentation/*, @store/*
 *
 * EXCEPTION (Phase 2): files under `src/application/providers/**` are
 * allowed to import `react` and `@tanstack/react-query`. This narrow
 * exception exists because:
 *   - `query-client.ts` configures the application-wide TanStack Query
 *     cache (the QueryClient class is non-React but lives in the
 *     `@tanstack/react-query` package).
 *   - `query-provider.tsx` wraps the QueryClient in a React context
 *     provider so screens can consume it via `useQuery`.
 *
 * The exception is scoped to the `providers/` subfolder — every other
 * application-layer file remains forbidden from importing React or
 * TanStack Query. The boundary is intentionally narrow.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from '@jest/globals';

const APPLICATION_ROOT = resolve(__dirname, '..');
const PROVIDERS_SUBFOLDER = resolve(APPLICATION_ROOT, 'providers');

const FORBIDDEN_MODULE_PATTERNS: readonly RegExp[] = [
  /^react($|\/)/,
  /^react-native($|\/)/,
  /^react-native-reanimated($|\/)/,
  /^react-native-safe-area-context($|\/)/,
  /^react-native-screens($|\/)/,
  /^expo($|\/)/,
  /^expo-router($|\/)/,
  /^expo-sqlite($|\/)/,
  /^expo-secure-store($|\/)/,
  /^expo-file-system($|\/)/,
  /^expo-crypto($|\/)/,
  /^expo-constants($|\/)/,
  /^expo-status-bar($|\/)/,
  /^zustand($|\/)/,
  /^@tanstack\/react-query($|\/)/,
  /^react-hook-form($|\/)/,
  /^@supabase\/supabase-js($|\/)/,
  /^@react-native-async-storage\/async-storage($|\/)/,
];

const FORBIDDEN_PATH_PATTERNS: readonly RegExp[] = [
  /^(@infrastructure|src\/infrastructure|@\/infrastructure)\//,
  /^(\.\.\/)+infrastructure\//,
  /^(@services|src\/services|@\/services)\//,
  /^(\.\.\/)+services\//,
  /^(@presentation|src\/presentation|@\/presentation)\//,
  /^(\.\.\/)+presentation\//,
  /^(@store|src\/store|@\/store)\//,
  /^(\.\.\/)+store\//,
  /^(@config|src\/config|@\/config)\//,
  /^(\.\.\/)+config\//,
];

const TEST_ONLY_ALLOWED_MODULES = ['@jest/globals', 'node:fs', 'node:path'];

/**
 * Modules that ARE allowed in the application-layer `providers/` subfolder.
 * Used to relax the FORBIDDEN_MODULE_PATTERNS list for those files only.
 */
const PROVIDERS_ALLOWED_MODULES = new Set(['react', '@tanstack/react-query']);

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkTsFiles(full, out);
    } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

function isProvidersFile(filePath: string): boolean {
  const rel = relative(APPLICATION_ROOT, filePath);
  // Match files that live directly under `providers/` OR a subfolder of it.
  return rel === 'providers' || rel.startsWith('providers/') || rel.startsWith('providers\\');
}

function extractImportSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const fromRe = /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(source)) !== null) {
    const spec = m[1];
    if (spec !== undefined) specs.push(spec);
  }
  while ((m = dynamicRe.exec(source)) !== null) {
    const spec = m[1];
    if (spec !== undefined) specs.push(spec);
  }
  return specs;
}

function findForbiddenImports(source: string, isTestFile: boolean, isProviders: boolean): string[] {
  const specs = extractImportSpecifiers(source);
  const matches: string[] = [];
  for (const spec of specs) {
    if (isTestFile && TEST_ONLY_ALLOWED_MODULES.includes(spec)) continue;
    // Relax the React / @tanstack/react-query ban for the providers subfolder.
    if (isProviders && PROVIDERS_ALLOWED_MODULES.has(spec)) continue;
    for (const re of FORBIDDEN_MODULE_PATTERNS) {
      if (re.test(spec)) {
        matches.push(`${spec} (forbidden module: ${re.source})`);
      }
    }
    for (const re of FORBIDDEN_PATH_PATTERNS) {
      if (re.test(spec)) {
        matches.push(`${spec} (forbidden cross-layer path: ${re.source})`);
      }
    }
  }
  return matches;
}

describe('application layer independence', () => {
  const files = walkTsFiles(APPLICATION_ROOT);
  if (files.length === 0) {
    // Application layer may be empty in early phases — skip but don't fail
    it.skip('no application files found', () => {});
    return;
  }

  it('finds application layer files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('has no forbidden imports in %s', (filePath) => {
    const source = readFileSync(filePath, 'utf-8');
    const isTestFile = filePath.includes('__tests__');
    const isProviders = isProvidersFile(filePath);
    const matches = findForbiddenImports(source, isTestFile, isProviders);
    if (matches.length > 0) {
      throw new Error(
        `Application file ${filePath} contains forbidden imports:\n` +
          matches.map((m) => `  - ${m}`).join('\n'),
      );
    }
    expect(matches).toEqual([]);
  });
});

describe('application providers narrow exception', () => {
  it('the providers folder exists and contains the expected files', () => {
    const providerFiles = walkTsFiles(PROVIDERS_SUBFOLDER);
    expect(providerFiles.length).toBeGreaterThan(0);
    const names = providerFiles.map((f) => relative(PROVIDERS_SUBFOLDER, f));
    expect(names).toContain('query-client.ts');
    expect(names).toContain('query-provider.tsx');
  });

  it('provider files import react and/or @tanstack/react-query (the relaxation is exercised)', () => {
    const providerFiles = walkTsFiles(PROVIDERS_SUBFOLDER);
    const allSpecs: string[] = [];
    for (const f of providerFiles) {
      const src = readFileSync(f, 'utf-8');
      allSpecs.push(...extractImportSpecifiers(src));
    }
    // At least one provider file imports @tanstack/react-query.
    expect(allSpecs.some((s) => s === '@tanstack/react-query')).toBe(true);
    // query-provider.tsx imports react.
    expect(allSpecs.some((s) => s === 'react')).toBe(true);
  });

  it('non-provider application files do NOT import react or @tanstack/react-query', () => {
    const nonProviderFiles = walkTsFiles(APPLICATION_ROOT).filter(
      (f) => !isProvidersFile(f),
    );
    for (const f of nonProviderFiles) {
      const src = readFileSync(f, 'utf-8');
      const specs = extractImportSpecifiers(src);
      for (const spec of specs) {
        expect(spec).not.toBe('react');
        expect(spec).not.toBe('@tanstack/react-query');
      }
    }
  });
});
