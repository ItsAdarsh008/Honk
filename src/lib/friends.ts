/**
 * The friend graph.
 *
 * One row per pair, stored as an ordered pair (`userAId` is always the smaller
 * uuid) so a pair can exist only once regardless of who asked first.
 *
 * Two rules from SPEC §6 are enforced here rather than in the UI:
 *
 *  - A block is **mutual**: neither party can see the other anywhere.
 *  - A block is **silent**: the blocked party is never told. A request from a
 *    blocked user therefore reports success and writes nothing, and blocked
 *    pairs are filtered out of every listing on both sides.
 */

import { and, eq, inArray, or, sql } from "drizzle-orm";
import { getDb, type Db } from "./db";
import { friendships, orderedPair, users, type FriendshipStatus } from "./db/schema";

/** The only user fields any other user is ever shown. Never the email. */
export interface PublicProfile {
  id: string;
  handle: string | null;
  displayName: string | null;
  /** Which university, so a cross-campus name can be labelled as one. */
  schoolId: string;
}

export interface FriendRequest {
  profile: PublicProfile;
  createdAt: Date;
}

export type RelationshipState =
  | "none"
  | "friends"
  | "request_sent"
  | "request_received"
  | "blocked";

const PUBLIC_COLUMNS = {
  id: users.id,
  handle: users.handle,
  displayName: users.displayName,
  schoolId: users.schoolId,
};

function pairWhere(a: string, b: string) {
  const { userAId, userBId } = orderedPair(a, b);
  return and(eq(friendships.userAId, userAId), eq(friendships.userBId, userBId));
}

async function getRow(db: Db, a: string, b: string) {
  const [row] = await db.select().from(friendships).where(pairWhere(a, b)).limit(1);
  return row ?? null;
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

/** True only for an accepted friendship. Every sensitive view gates on this. */
export async function areFriends(userId: string, otherId: string, db: Db = getDb()): Promise<boolean> {
  if (userId === otherId) return false;
  const row = await getRow(db, userId, otherId);
  return row?.status === "accepted";
}

/** True when either side has blocked the other. Blocks are symmetric. */
export async function isBlocked(userId: string, otherId: string, db: Db = getDb()): Promise<boolean> {
  if (userId === otherId) return false;
  const row = await getRow(db, userId, otherId);
  return row?.status === "blocked";
}

/**
 * Every user id this user must not see, and that must not see this user.
 * `queries.ts` subtracts this from every result set.
 */
export async function blockedUserIds(userId: string, db: Db = getDb()): Promise<string[]> {
  const rows = await db
    .select({ a: friendships.userAId, b: friendships.userBId })
    .from(friendships)
    .where(
      and(
        eq(friendships.status, "blocked"),
        or(eq(friendships.userAId, userId), eq(friendships.userBId, userId)),
      ),
    );
  return rows.map((r) => (r.a === userId ? r.b : r.a));
}

/** Accepted friends only. */
export async function friendIds(userId: string, db: Db = getDb()): Promise<string[]> {
  const rows = await db
    .select({ a: friendships.userAId, b: friendships.userBId })
    .from(friendships)
    .where(
      and(
        eq(friendships.status, "accepted"),
        or(eq(friendships.userAId, userId), eq(friendships.userBId, userId)),
      ),
    );
  return rows.map((r) => (r.a === userId ? r.b : r.a));
}

export async function listFriends(userId: string, db: Db = getDb()): Promise<PublicProfile[]> {
  const ids = await friendIds(userId, db);
  if (!ids.length) return [];
  return db.select(PUBLIC_COLUMNS).from(users).where(inArray(users.id, ids));
}

/** Requests waiting on this user's answer. Blocked pairs never appear. */
export async function listIncomingRequests(
  userId: string,
  db: Db = getDb(),
): Promise<FriendRequest[]> {
  const rows = await db
    .select({
      profile: PUBLIC_COLUMNS,
      createdAt: friendships.createdAt,
    })
    .from(friendships)
    .innerJoin(users, eq(users.id, friendships.requesterId))
    .where(
      and(
        eq(friendships.status, "pending"),
        or(eq(friendships.userAId, userId), eq(friendships.userBId, userId)),
        sql`${friendships.requesterId} <> ${userId}`,
      ),
    );
  return rows.map((r) => ({ profile: r.profile, createdAt: r.createdAt }));
}

/** Requests this user has sent that have not been answered. */
export async function listOutgoingRequests(
  userId: string,
  db: Db = getDb(),
): Promise<FriendRequest[]> {
  const rows = await db
    .select({
      profile: PUBLIC_COLUMNS,
      createdAt: friendships.createdAt,
      a: friendships.userAId,
      b: friendships.userBId,
    })
    .from(friendships)
    .innerJoin(
      users,
      sql`${users.id} = case when ${friendships.userAId} = ${userId} then ${friendships.userBId} else ${friendships.userAId} end`,
    )
    .where(
      and(
        eq(friendships.status, "pending"),
        eq(friendships.requesterId, userId),
        or(eq(friendships.userAId, userId), eq(friendships.userBId, userId)),
      ),
    );
  return rows.map((r) => ({ profile: r.profile, createdAt: r.createdAt }));
}

export async function listBlocked(userId: string, db: Db = getDb()): Promise<PublicProfile[]> {
  const rows = await db
    .select({
      profile: PUBLIC_COLUMNS,
    })
    .from(friendships)
    .innerJoin(
      users,
      sql`${users.id} = case when ${friendships.userAId} = ${userId} then ${friendships.userBId} else ${friendships.userAId} end`,
    )
    .where(
      and(
        eq(friendships.status, "blocked"),
        eq(friendships.blockedById, userId),
        or(eq(friendships.userAId, userId), eq(friendships.userBId, userId)),
      ),
    );
  return rows.map((r) => r.profile);
}

/**
 * How this user relates to another. A block reports `blocked` to the blocker
 * and `none` to the blocked party, which is what keeps it silent.
 */
export async function relationshipWith(
  userId: string,
  otherId: string,
  db: Db = getDb(),
): Promise<RelationshipState> {
  if (userId === otherId) return "none";
  const row = await getRow(db, userId, otherId);
  if (!row) return "none";
  return stateOf(row, userId);
}

/** The one place the stored row is turned into what one side of it sees. */
function stateOf(
  row: { status: FriendshipStatus; blockedById: string | null; requesterId: string },
  userId: string,
): RelationshipState {
  if (row.status === "blocked") return row.blockedById === userId ? "blocked" : "none";
  if (row.status === "accepted") return "friends";
  return row.requesterId === userId ? "request_sent" : "request_received";
}

/**
 * The same question asked about many people at once.
 *
 * `relationshipWith` is one query, which is fine for a profile page and was
 * quietly catastrophic for a class roster: the caller looped it over every
 * person in the section, so a three-hundred-person first-year lecture meant
 * three hundred round trips to Postgres to render one list. That is the one
 * query path that gets slower exactly as Honk gets more popular, which is the
 * worst possible shape for it to have.
 *
 * One query, whatever the size of the room. Anyone with no row at all is
 * simply absent from the map, which callers read as "none".
 */
export async function relationshipsWith(
  userId: string,
  otherIds: string[],
  db: Db = getDb(),
): Promise<Map<string, RelationshipState>> {
  const out = new Map<string, RelationshipState>();
  const ids = otherIds.filter((id) => id !== userId);
  if (!ids.length) return out;

  const rows = await db
    .select({
      userAId: friendships.userAId,
      userBId: friendships.userBId,
      status: friendships.status,
      blockedById: friendships.blockedById,
      requesterId: friendships.requesterId,
    })
    .from(friendships)
    .where(
      or(
        and(eq(friendships.userAId, userId), inArray(friendships.userBId, ids)),
        and(eq(friendships.userBId, userId), inArray(friendships.userAId, ids)),
      ),
    );

  for (const row of rows) {
    const otherId = row.userAId === userId ? row.userBId : row.userAId;
    out.set(otherId, stateOf(row, userId));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

export interface MutationResult {
  ok: boolean;
  status: RelationshipState;
  /** Present only when the caller did something genuinely invalid. */
  error?: string;
}

/**
 * Send a request. Requesting someone who has already requested you accepts
 * their request instead, so two people tapping at once become friends.
 */
export async function requestFriend(
  userId: string,
  targetId: string,
  db: Db = getDb(),
): Promise<MutationResult> {
  if (userId === targetId) return { ok: false, status: "none", error: "You cannot add yourself." };

  const existing = await getRow(db, userId, targetId);

  // Silent block: report the same thing a fresh request reports, write nothing.
  if (existing?.status === "blocked") {
    return existing.blockedById === userId
      ? { ok: false, status: "blocked", error: "You have blocked this person." }
      : { ok: true, status: "request_sent" };
  }

  if (existing?.status === "accepted") return { ok: true, status: "friends" };

  if (existing?.status === "pending") {
    if (existing.requesterId === userId) return { ok: true, status: "request_sent" };
    return acceptFriend(userId, targetId, db);
  }

  const pair = orderedPair(userId, targetId);
  await db.insert(friendships).values({
    ...pair,
    requesterId: userId,
    status: "pending",
  });
  return { ok: true, status: "request_sent" };
}

export async function acceptFriend(
  userId: string,
  otherId: string,
  db: Db = getDb(),
): Promise<MutationResult> {
  const existing = await getRow(db, userId, otherId);
  if (!existing) return { ok: false, status: "none", error: "There is no request to accept." };
  if (existing.status === "blocked") return { ok: false, status: "none" };
  if (existing.status === "accepted") return { ok: true, status: "friends" };
  if (existing.requesterId === userId) {
    return { ok: false, status: "request_sent", error: "You cannot accept your own request." };
  }

  await db
    .update(friendships)
    .set({ status: "accepted", updatedAt: new Date() })
    .where(pairWhere(userId, otherId));
  return { ok: true, status: "friends" };
}

/** Decline a request, or remove an existing friend. Both just delete the row. */
export async function removeFriend(
  userId: string,
  otherId: string,
  db: Db = getDb(),
): Promise<MutationResult> {
  const existing = await getRow(db, userId, otherId);
  if (!existing) return { ok: true, status: "none" };
  // Never let "remove" quietly undo a block.
  if (existing.status === "blocked") {
    return { ok: false, status: existing.blockedById === userId ? "blocked" : "none" };
  }
  await db.delete(friendships).where(pairWhere(userId, otherId));
  return { ok: true, status: "none" };
}

/**
 * Block. Unilateral, immediate, and it replaces whatever relationship existed.
 * The other party is not notified.
 */
export async function blockUser(
  userId: string,
  targetId: string,
  db: Db = getDb(),
): Promise<MutationResult> {
  if (userId === targetId) return { ok: false, status: "none", error: "You cannot block yourself." };

  const pair = orderedPair(userId, targetId);
  await db
    .insert(friendships)
    .values({
      ...pair,
      requesterId: userId,
      status: "blocked" as FriendshipStatus,
      blockedById: userId,
    })
    .onConflictDoUpdate({
      target: [friendships.userAId, friendships.userBId],
      set: { status: "blocked", blockedById: userId, updatedAt: new Date() },
    });

  return { ok: true, status: "blocked" };
}

/** Only the person who blocked can undo it. Undoing leaves the pair unrelated. */
export async function unblockUser(
  userId: string,
  targetId: string,
  db: Db = getDb(),
): Promise<MutationResult> {
  const existing = await getRow(db, userId, targetId);
  if (!existing || existing.status !== "blocked") return { ok: true, status: "none" };
  if (existing.blockedById !== userId) return { ok: false, status: "none" };
  await db.delete(friendships).where(pairWhere(userId, targetId));
  return { ok: true, status: "none" };
}
