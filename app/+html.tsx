/**
 * Root HTML document for the web build (static export).
 *
 * Without this file Expo Router emits a bare shell with no viewport,
 * no theme colour and no background paint. Per-route `<title>`, meta
 * description and link-preview tags come from `PageHead`
 * (expo-router/head); the root layout supplies a default title so no
 * route can render an empty one. Keeping those tags out of this file
 * means each document has exactly one title/description instead of a
 * static duplicate plus Helmet's.
 *
 * Notes:
 *   - The viewport deliberately allows pinch-zoom. Disabling zoom is a
 *     WCAG 1.4.4 failure, so there is no `maximum-scale` /
 *     `user-scalable=no`.
 *   - `ScrollViewStyleReset` is required for React Native Web scrolling.
 *   - Colours match `src/presentation/design-system/tokens.ts` so the
 *     browser chrome does not flash a different palette before the app's
 *     own background paints.
 */

import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

const BRAND_BACKGROUND_LIGHT = '#FAF8F5';
const BRAND_BACKGROUND_DARK = '#15161D';

/**
 * Paints the page background before React mounts so the first frame is
 * never white-on-dark or vice versa.
 */
const responsiveBackground = `
body { background-color: ${BRAND_BACKGROUND_LIGHT}; }
@media (prefers-color-scheme: dark) {
  body { background-color: ${BRAND_BACKGROUND_DARK}; }
}`;

export default function Root({ children }: PropsWithChildren): JSX.Element {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />

        <meta name="application-name" content="BillLens" />
        <meta name="color-scheme" content="light dark" />

        <meta
          name="theme-color"
          content={BRAND_BACKGROUND_LIGHT}
          media="(prefers-color-scheme: light)"
        />
        <meta
          name="theme-color"
          content={BRAND_BACKGROUND_DARK}
          media="(prefers-color-scheme: dark)"
        />

        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
