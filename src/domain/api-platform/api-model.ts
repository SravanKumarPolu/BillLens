/**
 * API resource model — public integration platform.
 *
 * Phase 10 Prompt 94: API and Developer Platform.
 *
 * This module defines the canonical list of API endpoints exposed by the
 * BillLens public REST/GraphQL API, the scopes required to call them, and
 * the rate-limit tier each endpoint belongs to.
 *
 * CRITICAL CONSTRAINTS:
 *   - Every endpoint MUST declare `requiredScopes` so that the OAuth scope
 *     check is enforced at the gateway, not at the controller.
 *   - Every endpoint MUST declare a `rateLimitTier` so that the rate limiter
 *     can look up the correct quota without consulting the controller.
 *   - Deprecated endpoints MUST set `deprecated: true` and provide a
 *     `sunsetDate`. The versioning module emits a `Sunset` HTTP header when
 *     a deprecated endpoint is invoked.
 *
 * This module is PURE: it exports only types, constants, and pure helpers.
 * No I/O, no framework imports.
 *
 * See `docs/api-developer-platform.md`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApiVersion = 'v1' | 'v2';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type RateLimitTier =
  | 'anonymous'
  | 'authenticated'
  | 'premium'
  | 'enterprise'
  | 'internal';

export type ApiScope =
  | 'read:groups'
  | 'write:groups'
  | 'read:expenses'
  | 'write:expenses'
  | 'read:settlements'
  | 'write:settlements'
  | 'read:balances'
  | 'export:data'
  | 'webhooks:manage';

// ---------------------------------------------------------------------------
// Scope registry
// ---------------------------------------------------------------------------

export const API_SCOPES: readonly ApiScope[] = Object.freeze([
  'read:groups',
  'write:groups',
  'read:expenses',
  'write:expenses',
  'read:settlements',
  'write:settlements',
  'read:balances',
  'export:data',
  'webhooks:manage',
]);

const API_SCOPE_SET: ReadonlySet<ApiScope> = new Set(API_SCOPES);

export function isApiScope(value: unknown): value is ApiScope {
  return typeof value === 'string' && API_SCOPE_SET.has(value as ApiScope);
}

// ---------------------------------------------------------------------------
// Endpoint registry
// ---------------------------------------------------------------------------

export interface ApiEndpoint {
  /** Path template, e.g. '/v1/groups/{groupId}/expenses'. */
  readonly path: string;
  readonly method: HttpMethod;
  readonly version: ApiVersion;
  readonly description: string;
  readonly requiredScopes: readonly ApiScope[];
  readonly rateLimitTier: RateLimitTier;
  readonly deprecated?: boolean;
  readonly sunsetDate?: string;
}

/**
 * Canonical endpoint registry.
 *
 * Order is stable: read endpoints first within each resource, then write
 * endpoints. This makes it easy for the developer-portal docs generator to
 * render a predictable table.
 */
export const API_ENDPOINTS: readonly ApiEndpoint[] = Object.freeze([
  // --- Groups (v1) --------------------------------------------------------
  {
    path: '/v1/groups',
    method: 'GET',
    version: 'v1',
    description: 'List groups the caller is a member of.',
    requiredScopes: ['read:groups'],
    rateLimitTier: 'authenticated',
  },
  {
    path: '/v1/groups',
    method: 'POST',
    version: 'v1',
    description: 'Create a new group.',
    requiredScopes: ['write:groups'],
    rateLimitTier: 'authenticated',
  },
  {
    path: '/v1/groups/{groupId}',
    method: 'GET',
    version: 'v1',
    description: 'Fetch a single group.',
    requiredScopes: ['read:groups'],
    rateLimitTier: 'authenticated',
  },
  {
    path: '/v1/groups/{groupId}',
    method: 'PATCH',
    version: 'v1',
    description: 'Update a group (name, currency, default split).',
    requiredScopes: ['write:groups'],
    rateLimitTier: 'authenticated',
  },
  {
    path: '/v1/groups/{groupId}',
    method: 'DELETE',
    version: 'v1',
    description: 'Delete a group.',
    requiredScopes: ['write:groups'],
    rateLimitTier: 'authenticated',
  },
  // --- Expenses (v1) ------------------------------------------------------
  {
    path: '/v1/groups/{groupId}/expenses',
    method: 'GET',
    version: 'v1',
    description: 'List expenses in a group.',
    requiredScopes: ['read:expenses'],
    rateLimitTier: 'authenticated',
  },
  {
    path: '/v1/groups/{groupId}/expenses',
    method: 'POST',
    version: 'v1',
    description: 'Create an expense in a group.',
    requiredScopes: ['write:expenses'],
    rateLimitTier: 'authenticated',
  },
  {
    path: '/v1/expenses/{expenseId}',
    method: 'GET',
    version: 'v1',
    description: 'Fetch a single expense.',
    requiredScopes: ['read:expenses'],
    rateLimitTier: 'authenticated',
  },
  {
    path: '/v1/expenses/{expenseId}',
    method: 'PATCH',
    version: 'v1',
    description: 'Update an expense.',
    requiredScopes: ['write:expenses'],
    rateLimitTier: 'authenticated',
  },
  {
    path: '/v1/expenses/{expenseId}',
    method: 'DELETE',
    version: 'v1',
    description: 'Delete an expense.',
    requiredScopes: ['write:expenses'],
    rateLimitTier: 'authenticated',
  },
  // --- Settlements (v1) ---------------------------------------------------
  {
    path: '/v1/groups/{groupId}/settlements',
    method: 'GET',
    version: 'v1',
    description: 'List settlements in a group.',
    requiredScopes: ['read:settlements'],
    rateLimitTier: 'authenticated',
  },
  {
    path: '/v1/groups/{groupId}/settlements',
    method: 'POST',
    version: 'v1',
    description: 'Create a settlement in a group.',
    requiredScopes: ['write:settlements'],
    rateLimitTier: 'authenticated',
  },
  {
    path: '/v1/settlements/{settlementId}/confirm',
    method: 'POST',
    version: 'v1',
    description: 'Confirm a settlement.',
    requiredScopes: ['write:settlements'],
    rateLimitTier: 'authenticated',
  },
  // --- Balances (v1) ------------------------------------------------------
  {
    path: '/v1/groups/{groupId}/balances',
    method: 'GET',
    version: 'v1',
    description: 'Fetch current balances for a group.',
    requiredScopes: ['read:balances'],
    rateLimitTier: 'authenticated',
  },
  // --- Data export (v1) ---------------------------------------------------
  {
    path: '/v1/me/export',
    method: 'GET',
    version: 'v1',
    description: 'Export the caller data as JSON (GDPR/CCPA).',
    requiredScopes: ['export:data'],
    rateLimitTier: 'premium',
  },
  // --- Webhooks (v1) ------------------------------------------------------
  {
    path: '/v1/webhooks',
    method: 'GET',
    version: 'v1',
    description: 'List webhook subscriptions.',
    requiredScopes: ['webhooks:manage'],
    rateLimitTier: 'authenticated',
  },
  {
    path: '/v1/webhooks',
    method: 'POST',
    version: 'v1',
    description: 'Create a webhook subscription.',
    requiredScopes: ['webhooks:manage'],
    rateLimitTier: 'authenticated',
  },
  {
    path: '/v1/webhooks/{subscriptionId}',
    method: 'DELETE',
    version: 'v1',
    description: 'Delete a webhook subscription.',
    requiredScopes: ['webhooks:manage'],
    rateLimitTier: 'authenticated',
  },
  // --- v2 (newer, paginated, includes `cursor` query param) ---------------
  {
    path: '/v2/groups/{groupId}/expenses',
    method: 'GET',
    version: 'v2',
    description: 'List expenses (cursor-paginated, includes line items).',
    requiredScopes: ['read:expenses'],
    rateLimitTier: 'authenticated',
  },
  {
    path: '/v2/groups/{groupId}/balances',
    method: 'GET',
    version: 'v2',
    description: 'Fetch balances with settlement history cursor.',
    requiredScopes: ['read:balances'],
    rateLimitTier: 'authenticated',
  },
  // --- v1 deprecated: replaced by v2 paginated versions -------------------
  {
    path: '/v1/groups/{groupId}/expenses',
    method: 'GET',
    version: 'v1',
    description: 'DEPRECATED — use /v2/.../expenses for cursor pagination.',
    requiredScopes: ['read:expenses'],
    rateLimitTier: 'authenticated',
    deprecated: true,
    sunsetDate: '2027-01-01',
  },
] as const);

// ---------------------------------------------------------------------------
// Scope helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when `requested` is present in `granted`.
 *
 * Scopes are exact-match — there is no hierarchy (having `write:groups`
 * does NOT grant `read:groups`; the client MUST request both). This makes
 * the security posture predictable: a token grants exactly what it says on
 * the tin, no more, no less.
 */
export function isScopeGranted(
  requested: ApiScope,
  granted: readonly ApiScope[],
): boolean {
  if (!isApiScope(requested)) {
    return false;
  }
  return granted.includes(requested);
}

/**
 * Returns the subset of `required` scopes that are NOT in `granted`.
 *
 * The gateway uses this to emit a `403 Forbidden` response with a
 * `WWW-Authenticate: scope="..."` header listing the missing scopes.
 */
export function getMissingScopes(
  required: readonly ApiScope[],
  granted: readonly ApiScope[],
): readonly ApiScope[] {
  const grantedSet = new Set(granted);
  return Object.freeze(required.filter((s) => !grantedSet.has(s)));
}

/**
 * Returns true when ALL `required` scopes are present in `granted`.
 */
export function areAllScopesGranted(
  required: readonly ApiScope[],
  granted: readonly ApiScope[],
): boolean {
  return getMissingScopes(required, granted).length === 0;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Returns the versioned path for an endpoint. Throws if the path's existing
 * version prefix does not match the requested version (this would indicate
 * a programming error in the endpoint registry).
 *
 * @example getVersionedPath('/v1/groups', 'v2') → '/v2/groups'
 */
export function getVersionedPath(path: string, version: ApiVersion): string {
  if (!path.startsWith('/')) {
    throw new Error(`Path must start with '/': ${path}`);
  }
  // Replace the leading '/v1/' or '/v2/' (or '/v1' at end-of-string).
  const replaced = path.replace(/^\/v\d+(?=\/|$)/, `/${version}`);
  if (!replaced.startsWith(`/${version}`)) {
    // Path had no version prefix — prepend one.
    return `/${version}${path}`;
  }
  return replaced;
}

/**
 * Finds an endpoint by path-template + method. Returns `undefined` when no
 * match exists.
 */
export function findEndpoint(
  path: string,
  method: HttpMethod,
): ApiEndpoint | undefined {
  return API_ENDPOINTS.find(
    (e) => e.path === path && e.method === method,
  );
}

/**
 * Returns all endpoints that require at least one of the given scopes.
 */
export function endpointsForScopes(
  scopes: readonly ApiScope[],
): readonly ApiEndpoint[] {
  const set = new Set(scopes);
  return Object.freeze(
    API_ENDPOINTS.filter((e) => e.requiredScopes.some((s) => set.has(s))),
  );
}
