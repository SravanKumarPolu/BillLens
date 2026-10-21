/**
 * Minimal fetch-shaped adapter over node:http for relay tests.
 *
 * Expo's Jest preset installs a native `fetch` stub that does not expose
 * `status`/`ok`, so tests inject this adapter into `RelayClient`.
 */

import { request } from 'node:http';

import type { FetchLike, FetchLikeResponse } from '@infrastructure/relay-reference/relay-client';

export const nodeHttpFetch: FetchLike = (url, init) =>
  new Promise<FetchLikeResponse>((resolve, reject) => {
    const parsed = new URL(url);
    const req = request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        method: init.method,
        headers: init.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
            status: res.statusCode ?? 0,
            text: async () => Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('error', reject);
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
