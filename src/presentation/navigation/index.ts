/**
 * Presentation navigation barrel.
 *
 * Re-exports route guards and (later) navigation helpers. Route files
 * import guards from here so the import path stays stable as the
 * underlying store implementations evolve.
 */

export { requireDraftExists, requireGroupExists, requireOnboardingComplete } from './route-guards';
