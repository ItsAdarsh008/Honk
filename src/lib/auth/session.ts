/**
 * Sign-in: `@uwaterloo.ca` gating, six-digit codes, database-backed sessions.
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

export const SESSION_COOKIE = "honk_session";
export const CODE_TTL_MINUTES = 10;
export const MAX_CODE_ATTEMPTS = 5;
export const SESSION_TTL_DAYS = 60;

/** Per-email and per-IP request ceilings, both over one hour. */
export const RATE_LIMIT_PER_EMAIL = 5;
export const RATE_LIMIT_PER_IP = 20;
const RATE_WINDOW_MINUTES = 60;

const ALLOWED_DOMAINS = ["uwaterloo.ca", "edu.uwaterloo.ca"] as const;

/* ------------------------------------------------------------------ *
 * Email
 * ------------------------------------------------------------------ */

/**
 * Lower-case, trimmed, and with `edu.uwaterloo.ca` folded onto `uwaterloo.ca`
 * so the same person cannot end up with two accounts. Returns null for
 * anything that is not a Waterloo address.
 */
export function normalizeEmail(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed.length > 254) return null;
  // One @, a non-empty local part, no whitespace.
  const match = /^([a-z0-9._%+-]+)@([a-z0-9.-]+)$/.exec(trimmed);
  if (!match) return null;
  const [, local, domain] = match;
  if (!ALLOWED_DOMAINS.includes(domain as (typeof ALLOWED_DOMAINS)[number])) return null;
  return `${local}@uwaterloo.ca`;
}

export function isWaterlooEmail(raw: string): boolean {
  return normalizeEmail(raw) !== null;
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

  const [created] = await db.insert(users).values({ email, verifiedAt: new Date() }).returning();
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
