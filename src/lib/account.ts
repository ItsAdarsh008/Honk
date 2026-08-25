import "server-only";

/**
 * Self-scoped account mutations.
 *
 * Every function here touches only the caller's own rows. Nothing in this file
 * reads another user's data — that all lives behind the checks in
 * `overlap/queries.ts` and `friends.ts`.
 */

import { eq } from "drizzle-orm";
import { getDb, type Db } from "./db";
import { users } from "./db/schema";
import { destroyAllSessions } from "./auth/session";

/** The one privacy switch. Off until the user turns it on. */
export async function setDiscoverable(
  userId: string,
  discoverable: boolean,
  db: Db = getDb(),
): Promise<void> {
  await db
    .update(users)
    .set({ discoverable, privacyPromptedAt: new Date() })
    .where(eq(users.id, userId));
}

/** Records that the once-only discoverability prompt has been answered. */
export async function markPrivacyPrompted(userId: string, db: Db = getDb()): Promise<void> {
  await db.update(users).set({ privacyPromptedAt: new Date() }).where(eq(users.id, userId));
}

/**
 * Hard delete. Enrollments, friendships and sessions all cascade from the user
 * row, so this leaves nothing behind but the shared course and section rows
 * that other people are still pointing at.
 */
export async function deleteAccount(userId: string, db: Db = getDb()): Promise<void> {
  await destroyAllSessions(userId, db);
  await db.delete(users).where(eq(users.id, userId));
}
