/**
 * Sign-in: school-address gating, six-digit codes, database-backed sessions.
 *
 * Codes and session tokens are only ever stored as SHA-256 hashes, so a dump
 * of the database does not let anyone sign in as somebody else.
 */

import "server-only";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb, type Db } from "../db";
import { loginCodes, sessions, users, type User } from "../db/schema";
import { DEFAULT_SCHOOL_ID, parseSchoolAddress, type School } from "../schools";
import { lockoutMinutes } from "./pin";

export const SESSION_COOKIE = "honk_session";
/**
 * How long a code stays good.
 *
 * Was 10 minutes, which is the ordinary choice and was wrong here. Waterloo's
 * gateway throttles mail from a domain with no reputation: the first codes
 * Honk ever sent were accepted and then took somewhere between two minutes and
 * two hours to appear. A code that expires in ten is dead on arrival, so
 * delivery succeeding and sign-in working were two different problems and only
 * the first was solved.
 *
 * An hour costs almost nothing in security. Requesting a code invalidates the
 * previous one, so exactly one is live at a time, and `MAX_CODE_ATTEMPTS` caps
 * guesses at five against it — the brute-force surface is set by that cap, not
 * by the clock. What a longer window really costs is a valid code sitting in a
 * mailbox for longer, and anyone who can read that mailbox could request a
 * fresh code anyway.
 */
export const CODE_TTL_MINUTES = 60;
export const MAX_CODE_ATTEMPTS = 5;
export const SESSION_TTL_DAYS = 60;

/** Per-email and per-IP request ceilings, both over one hour. */
export const RATE_LIMIT_PER_EMAIL = 5;
export const RATE_LIMIT_PER_IP = 20;
const RATE_WINDOW_MINUTES = 60;

/* ------------------------------------------------------------------ *
 * Email
 * ------------------------------------------------------------------ */

/**
 * What an address turned out to be.
 *
 * Three outcomes, not two, and the third is the whole reason this is not a
 * boolean. Somebody typing `me@queensu.ca` into the sign-in box is the
 * highest-intent visitor Honk will ever get, and telling them "that isn't a
 * valid address" is both false and the fastest way to lose them. They get told
 * Honk knows Queen's and is not there yet, and are offered the chance to be
 * the person who changes that.
 */
export type AddressCheck =
  | { ok: true; email: string; school: School }
  | { ok: false; reason: "not_a_school" }
  | { ok: false; reason: "not_live"; school: School };

export function checkAddress(raw: string): AddressCheck {
  const parsed = parseSchoolAddress(raw);
  if (!parsed) return { ok: false, reason: "not_a_school" };
  if (parsed.school.status !== "live") return { ok: false, reason: "not_live", school: parsed.school };
  return { ok: true, email: parsed.email, school: parsed.school };
}

/**
 * Lower-case, trimmed, and folded onto the school's canonical domain so the
 * same person cannot end up with two accounts — `edu.uwaterloo.ca` onto
 * `uwaterloo.ca`, `my.yorku.ca` onto `yorku.ca`. Null for anything that is not
 * an address at a school Honk is live at.
 */
export function normalizeEmail(raw: string): string | null {
  const checked = checkAddress(raw);
  return checked.ok ? checked.email : null;
}

/** The school id to stamp on a new account. Null when the address is no good. */
export function schoolIdForEmail(raw: string): string | null {
  const checked = checkAddress(raw);
  return checked.ok ? checked.school.id : null;
}

/**
 * The same, for the account-creation paths, which have already established the
 * address is good. Falls back to Waterloo rather than throwing: a row with the
 * wrong school is recoverable, and a sign-up that 500s is not.
 */
function schoolIdFor(email: string): string {
  return schoolIdForEmail(email) ?? DEFAULT_SCHOOL_ID;
}

/* ------------------------------------------------------------------ *
 * Codes
 * ------------------------------------------------------------------ */

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Salted with the email so a code hash is useless against another account. */
export function hashCode(email: string, code: string): string {
  return createHash("sha256").update(`${email}:${code}`).digest("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export type RateLimitResult = { ok: true } | { ok: false; reason: "email" | "ip" };

/** Counts recent code requests. No extra table: the codes are their own log. */
export async function checkRateLimit(
  email: string,
  ip: string | null,
  db: Db = getDb(),
): Promise<RateLimitResult> {
  const since = new Date(Date.now() - RATE_WINDOW_MINUTES * 60_000);

  const [byEmail] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(loginCodes)
    .where(and(eq(loginCodes.email, email), gt(loginCodes.createdAt, since)));
  if (byEmail.count >= RATE_LIMIT_PER_EMAIL) return { ok: false, reason: "email" };

  if (ip) {
    const [byIp] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(loginCodes)
      .where(and(eq(loginCodes.requestIp, ip), gt(loginCodes.createdAt, since)));
    if (byIp.count >= RATE_LIMIT_PER_IP) return { ok: false, reason: "ip" };
  }

  return { ok: true };
}

/**
 * Issue a code. Returns the plaintext exactly once, for the caller to email —
 * it is never stored and cannot be read back.
 */
export async function createLoginCode(
  email: string,
  ip: string | null,
  db: Db = getDb(),
): Promise<string> {
  const code = generateCode();
  // Any earlier unused code for this address stops working.
  await db
    .update(loginCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(loginCodes.email, email), isNull(loginCodes.consumedAt)));

  await db.insert(loginCodes).values({
    email,
    codeHash: hashCode(email, code),
    requestIp: ip,
    expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
  });
  return code;
}

export type VerifyResult =
  | { ok: true; user: User; isNewUser: boolean }
  | { ok: false; reason: "no_code" | "expired" | "too_many_attempts" | "wrong_code" };

/**
 * Check a code and, on success, create the user if this is their first
 * sign-in. Attempts are capped per code so a six-digit space cannot be walked.
 */
export async function verifyLoginCode(
  email: string,
  code: string,
  db: Db = getDb(),
): Promise<VerifyResult> {
  const [record] = await db
    .select()
    .from(loginCodes)
    .where(and(eq(loginCodes.email, email), isNull(loginCodes.consumedAt)))
    .orderBy(desc(loginCodes.createdAt))
    .limit(1);

  if (!record) return { ok: false, reason: "no_code" };

  if (record.expiresAt.getTime() < Date.now()) {
    await db.update(loginCodes).set({ consumedAt: new Date() }).where(eq(loginCodes.id, record.id));
    return { ok: false, reason: "expired" };
  }

  if (record.attempts >= MAX_CODE_ATTEMPTS) {
    await db.update(loginCodes).set({ consumedAt: new Date() }).where(eq(loginCodes.id, record.id));
    return { ok: false, reason: "too_many_attempts" };
  }

  const supplied = code.replace(/\D/g, "");
  if (!constantTimeEqual(hashCode(email, supplied), record.codeHash)) {
    await db
      .update(loginCodes)
      .set({ attempts: record.attempts + 1 })
      .where(eq(loginCodes.id, record.id));
    return { ok: false, reason: "wrong_code" };
  }

  await db.update(loginCodes).set({ consumedAt: new Date() }).where(eq(loginCodes.id, record.id));

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    if (!existing.verifiedAt) {
      const [updated] = await db
        .update(users)
        .set({ verifiedAt: new Date() })
        .where(eq(users.id, existing.id))
        .returning();
      return { ok: true, user: updated, isNewUser: false };
    }
    return { ok: true, user: existing, isNewUser: false };
  }

  const [created] = await db
    .insert(users)
    .values({ email, schoolId: schoolIdFor(email), verifiedAt: new Date() })
    .returning();
  return { ok: true, user: created, isNewUser: true };
}

/* ------------------------------------------------------------------ *
 * Sessions
 * ------------------------------------------------------------------ */

/** Create a session row and set the cookie. Returns the raw token. */
export async function createSession(userId: string, db: Db = getDb()): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60_000);

  await db.insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return token;
}

/** The signed-in user, or null. Expired sessions are cleaned up as they are hit. */
export async function getCurrentUser(db: Db = getDb()): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const [row] = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    return null;
  }
  return row.user;
}

export async function destroySession(db: Db = getDb()): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  jar.delete(SESSION_COOKIE);
}

/** Every session for a user. Used when an account is deleted. */
export async function destroyAllSessions(userId: string, db: Db = getDb()): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/* ------------------------------------------------------------------ *
 * Profile
 * ------------------------------------------------------------------ */

const HANDLE_RE = /^[a-z0-9_]{2,20}$/;

export function normalizeHandle(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase().replace(/^@/, "");
  return HANDLE_RE.test(trimmed) ? trimmed : null;
}

export type ProfileResult =
  | { ok: true; user: User }
  | { ok: false; reason: "bad_handle" | "bad_name" | "handle_taken" };

/** Set on first sign-in. Display name and handle, and nothing else. */
export async function setProfile(
  userId: string,
  displayName: string,
  handle: string,
  db: Db = getDb(),
): Promise<ProfileResult> {
  const name = displayName.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 40) return { ok: false, reason: "bad_name" };

  const normalized = normalizeHandle(handle);
  if (!normalized) return { ok: false, reason: "bad_handle" };

  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.handle, normalized))
    .limit(1);
  if (taken && taken.id !== userId) return { ok: false, reason: "handle_taken" };

  const [updated] = await db
    .update(users)
    .set({ displayName: name, handle: normalized })
    .where(eq(users.id, userId))
    .returning();
  return { ok: true, user: updated };
}

/** True once the user has a name and handle — the only onboarding there is. */
export function hasProfile(user: User): boolean {
  return Boolean(user.displayName && user.handle);
}

/* ------------------------------------------------------------------ *
 * Entra sign-in
 * ------------------------------------------------------------------ */

/**
 * Find or create the account behind a verified Waterloo token.
 *
 * Three cases, in order. A known `oid` is the account, full stop. Otherwise an
 * existing row with the same address is adopted and stamped — that is what
 * lets somebody who signed up with an email code switch to signing in with
 * Waterloo without ending up with two accounts and half a schedule in each.
 * Failing both, it is a new user.
 *
 * `verifiedAt` is set unconditionally: Waterloo's own directory vouching for
 * the account is a stronger proof than a code read out of a mailbox.
 */
export async function findOrCreateEntraUser(
  identity: { oid: string; email: string; name: string | null },
  db: Db = getDb(),
): Promise<{ user: User; isNewUser: boolean }> {
  const [byOid] = await db
    .select()
    .from(users)
    .where(eq(users.entraOid, identity.oid))
    .limit(1);
  if (byOid) return { user: byOid, isNewUser: false };

  const [byEmail] = await db
    .select()
    .from(users)
    .where(eq(users.email, identity.email))
    .limit(1);
  if (byEmail) {
    const [adopted] = await db
      .update(users)
      .set({ entraOid: identity.oid, verifiedAt: byEmail.verifiedAt ?? new Date() })
      .where(eq(users.id, byEmail.id))
      .returning();
    return { user: adopted, isNewUser: false };
  }

  const [created] = await db
    .insert(users)
    .values({
      email: identity.email,
      // The Entra path runs against Waterloo tenant and nobody else.
      schoolId: schoolIdFor(identity.email),
      entraOid: identity.oid,
      // Entra hands us a real name; it is still editable on the profile step.
      displayName: identity.name,
      verifiedAt: new Date(),
    })
    .returning();
  return { user: created, isNewUser: true };
}

/**
 * The account behind a passkey.
 *
 * `verifiedAt` is set here, and it is worth being explicit about what that
 * does and does not mean now that no code is ever sent.
 *
 * It no longer means "this address was proved". Nothing proves that any more.
 * It means "this account finished signing up", and it exists because every
 * social read gates on it — `overlap/queries.ts`, `invite.ts`, `stats.ts` — so
 * leaving it null would make every user invisible to every other user and the
 * classmates feature would simply not work.
 *
 * The cost, stated plainly: anyone can type any `@uwaterloo.ca` address and
 * get an account under it, including one that is not theirs. What actually
 * protects people is unchanged and is where SPEC section 6 always put it —
 * `discoverable` defaults false, identities are never shown to non-friends,
 * and gaps and room numbers need an accepted request. An impostor still has to
 * paste a real-looking schedule and be accepted by somebody before they learn
 * anything, and a genuine student acting in bad faith could always do that.
 *
 * What is genuinely lost is the Waterloo-only guarantee: without a code or a
 * directory token, nothing stops somebody outside the university joining. That
 * is a fine trade for a closed beta and a poor one for an open launch, so it
 * is worth revisiting before the frosh-week push.
 */
export async function findOrCreatePasskeyUser(email: string, db: Db = getDb()): Promise<User> {
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(users)
    .values({ email, schoolId: schoolIdFor(email), verifiedAt: new Date() })
    .returning();
  return created;
}

/** A user by id. Self-scoped: the caller already proved it is this account. */
export async function getUserById(id: string, db: Db = getDb()): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

/* ------------------------------------------------------------------ *
 * Passwords
 * ------------------------------------------------------------------ */

export type PinSignUp =
  | { ok: true; user: User }
  | { ok: false; reason: "taken" };

/**
 * Create an account from an address and a password.
 *
 * `verifiedAt` is set for the same reason the passkey path sets it: every
 * social read gates on it, so an account without it is invisible and the
 * classmates feature does not work. It records that signup finished, not that
 * the address was proved — nothing proves that while codes are switched off.
 *
 * An address that already has a password is refused rather than overwritten.
 * Silently replacing it would mean anybody could take over any account by
 * signing up again with the same address.
 */
export async function createPinUser(
  email: string,
  pinHash: string,
  db: Db = getDb(),
): Promise<PinSignUp> {
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existing?.pinHash) return { ok: false, reason: "taken" };

  if (existing) {
    // Claimed by a passkey but never given a password: adding one is fine, and
    // it is how somebody adds a second way in.
    const [updated] = await db
      .update(users)
      .set({ pinHash, verifiedAt: existing.verifiedAt ?? new Date() })
      .where(eq(users.id, existing.id))
      .returning();
    return { ok: true, user: updated };
  }

  const [created] = await db
    .insert(users)
    .values({ email, pinHash, schoolId: schoolIdFor(email), verifiedAt: new Date() })
    .returning();
  return { ok: true, user: created };
}

export type PinSignIn =
  | { ok: true; user: User }
  | { ok: false; reason: "wrong" | "locked"; retryAfterMinutes?: number };

/** The account for an address, for the sign-in route to check a password against. */
export async function findUserForSignIn(email: string, db: Db = getDb()): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user ?? null;
}

export function lockoutRemaining(user: User, now: Date = new Date()): number | null {
  if (!user.lockedUntil) return null;
  const minutes = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60_000);
  return minutes > 0 ? minutes : null;
}

/** A wrong PIN. The lockout lengthens with the run, so patience costs time. */
export async function recordFailedLogin(user: User, db: Db = getDb()): Promise<void> {
  const failed = user.failedLogins + 1;
  const minutes = lockoutMinutes(failed);
  await db
    .update(users)
    .set({
      failedLogins: failed,
      lockedUntil: minutes === null ? null : new Date(Date.now() + minutes * 60_000),
    })
    .where(eq(users.id, user.id));
}

/** A correct PIN. Clears the brake so a bad week does not accumulate. */
export async function clearFailedLogins(user: User, db: Db = getDb()): Promise<void> {
  if (user.failedLogins === 0 && user.lockedUntil === null) return;
  await db
    .update(users)
    .set({ failedLogins: 0, lockedUntil: null })
    .where(eq(users.id, user.id));
}
