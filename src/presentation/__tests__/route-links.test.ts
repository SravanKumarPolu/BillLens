/**
 * Literal navigation targets must resolve to an app route.
 * Dynamic template links are covered by their screens' parameter guards.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from '@jest/globals';

const ROOT = process.cwd();

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, files);
    else if (path.endsWith('.tsx') || path.endsWith('.ts')) files.push(path);
  }
  return files;
}

function appRoutes(): Set<string> {
  const routes = new Set<string>();
  routes.add('/');
  for (const file of walk(join(ROOT, 'app'))) {
    if (file.includes('+html') || file.includes('_layout')) continue;
    let route = `/${relative(join(ROOT, 'app'), file).replace(/\.tsx?$/, '')}`;
    route = route.replace(/\/\([^/]+\)/g, '');
    route = route.replace(/\/index$/, '');
    routes.add(route === '' ? '/' : route);
  }
  return routes;
}

describe('navigation links', () => {
  it('every literal router target has a route file', () => {
    const routes = appRoutes();
    const missing: string[] = [];
    const files = [...walk(join(ROOT, 'src', 'presentation')), ...walk(join(ROOT, 'app'))];
    const pattern = /router\.(?:push|replace)\(\s*['"`]([^'"`$]+)['"`]/g;

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(pattern)) {
        const target = (match[1] ?? '').split('?')[0] ?? '';
        if (!target.startsWith('/')) continue;
        const normalized =
          target.replace(/\/\([^/]+\)/g, '').replace(/\/$/, '') || '/';
        // Dynamic route literals are generated elsewhere; only static paths
        // are checked here.
        if (normalized.includes('[')) continue;
        if (!routes.has(normalized)) missing.push(`${relative(ROOT, file)} → ${normalized}`);
      }
    }

    expect([...new Set(missing)]).toEqual([]);
  });
});
