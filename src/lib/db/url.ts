/**
 * Reading `DATABASE_URL` out of the environment.
 *
 * Deliberately forgiving, for the same reason `normalizeSiteUrl` is. A value
 * copied straight out of `.env.local` arrives wrapped in the quotes that file
 * uses — `"postgresql://..."` — because dotenv strips them locally and a
 * hosting dashboard does not. `postgres()` then threw `TypeError: Invalid URL`
 * on the first query, which surfaced as a bare 500 on sign-in with nothing on
 * the page to say why. Quotes and stray whitespace are a transcription
 * artefact, never part of a connection string, so strip them here rather than
 * failing at the first request.
 */

/** Accepts `postgres://...`, `"postgres://..."`, `' postgres://... '`. */
export function normalizeDatabaseUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let value = raw.trim();
  // Only a matched pair, so a password containing a quote is left alone.
  if (value.length >= 2 && (value.startsWith('"') || value.startsWith("'"))) {
    if (value.endsWith(value[0])) value = value.slice(1, -1).trim();
  }
  return value || null;
}

/** The configured connection string, or null when there is no usable one. */
export function databaseUrl(): string | null {
  return normalizeDatabaseUrl(process.env.DATABASE_URL);
}
