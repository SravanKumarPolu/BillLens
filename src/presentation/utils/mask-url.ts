/**
 * Mask a URL to show only the hostname, not the full URL.
 *
 * Prevents infrastructure detail leakage (e.g. Supabase project IDs, path
 * segments) in non-dev environments. The hostname alone is sufficient for a
 * developer to confirm "am I pointing at the right backend?" without
 * exposing the full URL to anyone glancing at the screen.
 *
 * @example
 *   maskUrl('https://billlens.supabase.co')           // 'billlens.supabase.co'
 *   maskUrl('https://billlens.supabase.co/rest/v1')   // 'billlens.supabase.co'
 *   maskUrl('not-a-url')                              // '(invalid URL)'
 */
export function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return '(invalid URL)';
  }
}
