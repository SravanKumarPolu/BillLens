/**
 * PageHead — per-route document metadata for the web build.
 *
 * `expo-router/head` renders into the document head on web and is a
 * no-op on native, so route files can set a title and description without
 * branching on platform. Titles fall back to the default supplied by the
 * root layout.
 *
 * Tags are flat children of `<Head>`: react-helmet-async silently drops
 * tags nested inside a Fragment, which is why descriptions used to go
 * missing while titles rendered.
 *
 * Use `noindex` for signed-in surfaces (settings, drafts, expense detail)
 * so private screens never enter a search index.
 */

import Head from 'expo-router/head';
import type { ReactNode } from 'react';

const PRODUCT_NAME = 'BillLens';

export interface PageHeadProps {
  /** Page name, e.g. "Groups". Rendered as "<title> · BillLens". */
  readonly title: string;
  readonly description?: string;
  /** Keep this route out of search results. Default false. */
  readonly noindex?: boolean;
}

export function PageHead({
  title,
  description,
  noindex = false,
}: PageHeadProps): ReactNode {
  const fullTitle = title === PRODUCT_NAME ? title : `${title} · ${PRODUCT_NAME}`;

  return (
    <Head>
      <title>{fullTitle}</title>
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="BillLens" />
      <meta property="og:title" content={fullTitle} />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={fullTitle} />
      {description !== undefined ? (
        <meta name="description" content={description} />
      ) : null}
      {description !== undefined ? (
        <meta property="og:description" content={description} />
      ) : null}
      {description !== undefined ? (
        <meta name="twitter:description" content={description} />
      ) : null}
      {noindex ? <meta name="robots" content="noindex, nofollow" /> : null}
    </Head>
  );
}
