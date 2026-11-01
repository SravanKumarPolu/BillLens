/**
 * Domain layer independence test.
 *
 * Asserts that every TypeScript file under `src/domain/` contains no
 * `import ... from` statements referencing frameworks or other layers that
 * the domain is forbidden to depend on.
 *
 * Also scans `src/domain/__tests__/` files — they may import `@jest/globals`
 * and `node:*` modules, but must still not import frameworks or outer layers.
 *
 * This is a belt-and-suspenders defense alongside the ESLint
 * `no-restricted-imports` rule: even if ESLint is bypassed (e.g. an editor
 * without lint-on-save), this test will fail in CI.
 *
 * See `docs/architecture-boundaries.md` for the full rule table.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from '@jest/globals';

const DOMAIN_ROOT = resolve(__dirname, '..');

const FORBIDDEN_MODULE_PATTERNS: readonly RegExp[] = [
  // React / React Native
  /^react($|\/)/,
  /^react-native($|\/)/,
  /^react-native-reanimated($|\/)/,
  /^react-native-safe-area-context($|\/)/,
  /^react-native-screens($|\/)/,
  // Expo
  /^expo($|\/)/,
  /^expo-router($|\/)/,
  /^expo-sqlite($|\/)/,
  /^expo-secure-store($|\/)/,
  /^expo-file-system($|\/)/,
  /^expo-crypto($|\/)/,
  /^expo-constants($|\/)/,
  /^expo-status-bar($|\/)/,
  // State / data
  /^zustand($|\/)/,
  /^@tanstack\/react-query($|\/)/,
  /^react-hook-form($|\/)/,
  // Backend
  /^@supabase\/supabase-js($|\/)/,
  // Storage
  /^@react-native-async-storage\/async-storage($|\/)/,
];

const FORBIDDEN_PATH_PATTERNS: readonly RegExp[] = [
  /^(@presentation|src\/presentation|@\/presentation)\//,
  /^(@application|src\/application|@\/application)\//,
  /^(@infrastructure|src\/infrastructure|@\/infrastructure)\//,
  /^(@services|src\/services|@\/services)\//,
  /^(@store|src\/store|@\/store)\//,
  /^(@config|src\/config|@\/config)\//,
];

/** Modules allowed ONLY in test files (not in production domain code). */
const TEST_ONLY_ALLOWED_MODULES = ['@jest/globals', 'node:fs', 'node:path'];

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) {
      continue;
    }
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

function findForbiddenImports(
  source: string,
  isTestFile: boolean,
): string[] {
  const specs = extractImportSpecifiers(source);
  const matches: string[] = [];
  for (const spec of specs) {
    // Allow test-only modules in test files
    if (isTestFile && TEST_ONLY_ALLOWED_MODULES.includes(spec)) continue;

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

describe('domain layer independence', () => {
  const files = walkTsFiles(DOMAIN_ROOT);
  if (files.length === 0) {
    throw new Error('No domain files found — check DOMAIN_ROOT');
  }

  it('finds domain entity and repository files', () => {
    expect(files.length).toBeGreaterThan(0);
    const names = files.map((f) => f.split('/').pop());
    expect(names).toContain('expense.ts');
    expect(names).toContain('group.ts');
    expect(names).toContain('money.ts');
    expect(names).toContain('balance-engine.ts');
  });

  it.each(files)('has no forbidden imports in %s', (filePath) => {
    const source = readFileSync(filePath, 'utf-8');
    const isTestFile = filePath.includes('__tests__');
    const matches = findForbiddenImports(source, isTestFile);
    if (matches.length > 0) {
      throw new Error(
        `Domain file ${filePath} contains forbidden imports:\n` +
          matches.map((m) => `  - ${m}`).join('\n'),
      );
    }
    expect(matches).toEqual([]);
  });
});
