/**
 * Where Honk thinks it lives.
 *
 * Used for `metadataBase`, which decides the absolute URLs in the OG tags.
 *
 * This is deliberately forgiving. It previously did `new URL(process.env...)`
 * at module scope, which meant a site URL written the way Vercel displays it —
 * `honk.vercel.app`, no scheme — threw `TypeError: Invalid URL` and failed the
 * entire build with "Failed to collect page data for /". An env var that only
 * affects link previews must never be able to take a deploy down, so every
 * failure here falls through to the next candidate instead of throwing.
 */

const FALLBACK = "http://localhost:3000";

/** Accepts `example.com`, `https://example.com/`, ` example.com `. */
export function normalizeSiteUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * The first candidate that parses.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` is the stable production domain and
 * `VERCEL_URL` is the per-deployment one, so a Vercel deploy gets sensible
 * link previews even if nothing is configured at all.
 */
export function siteUrl(): string {
  return (
    normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL) ??
    normalizeSiteUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    normalizeSiteUrl(process.env.VERCEL_URL) ??
    FALLBACK
  );
}
