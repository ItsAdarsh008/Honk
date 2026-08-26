import "server-only";

/**
 * Aggregate counts with no viewer.
 *
 * This is the second read of `users` that happens without a signed-in viewer
 * (the other is `invite.ts`), and it is safe for the same reason the class
 * counts are: it returns a number and never a row. No identity, no handle, no
 * schedule — nothing that could be attributed to a person. SPEC §6 permits
 * aggregates to everyone precisely because a count reveals nobody.
 */

import { isNotNull, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "./db";
import { users } from "./db/schema";

/**
 * Below this the counter renders nothing at all.
 *
 * Honk launches into a cold start, and a badge reading "3 students" during
 * frosh week does more harm than no badge — the number is meant to reassure a
 * stranger that the app is worth pasting into. Omitting a stat is not a claim;
 * once it shows, it is the true count.
 */
export const MIN_VISIBLE_COUNT = 25;

const CACHE_TTL_MS = 5 * 60_000;
let cached: { value: number; at: number } | null = null;

/** Verified accounts. Unverified rows are abandoned sign-in attempts. */
export async function getUserCount(): Promise<number | null> {
  if (!hasDatabase()) return null;

  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  try {
    const [row] = await getDb()
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(users)
      .where(isNotNull(users.verifiedAt));
    cached = { value: row?.count ?? 0, at: Date.now() };
    return cached.value;
  } catch {
    // The landing page must render with or without a database.
    return null;
  }
}

/** The count to show, or null when there is nothing worth showing. */
export async function getVisibleUserCount(): Promise<number | null> {
  const count = await getUserCount();
  if (count === null || count < MIN_VISIBLE_COUNT) return null;
  return count;
}
