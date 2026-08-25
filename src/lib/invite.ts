import "server-only";

/**
 * Naming the person behind an invite link.
 *
 * This is the one read of `users` that happens without a signed-in viewer, so
 * it is deliberately narrow: it returns a display name only for a user who has
 * opted in to being seen, and null for everyone else. A handle is short enough
 * to guess, and an invite page that named hidden users would be a way to turn
 * guessed handles into real names.
 *
 * The invite page reads perfectly well without a name — it just says "Someone
 * sent you Honk" instead.
 */

import { and, eq, isNotNull } from "drizzle-orm";
import { getDb, hasDatabase } from "./db";
import { users } from "./db/schema";

export async function getInviterName(handle: string): Promise<string | null> {
  if (!hasDatabase()) return null;
  const normalized = handle.trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9_]{2,20}$/.test(normalized)) return null;

  try {
    const [row] = await getDb()
      .select({ displayName: users.displayName })
      .from(users)
      .where(
        and(
          eq(users.handle, normalized),
          eq(users.discoverable, true),
          isNotNull(users.verifiedAt),
        ),
      )
      .limit(1);
    return row?.displayName ?? null;
  } catch {
    return null;
  }
}
