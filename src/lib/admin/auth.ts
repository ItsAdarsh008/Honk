import "server-only";

/**
 * The admin gate.
 *
 * Deliberately nothing to do with the student sign-in next door, for a reason
 * worth stating: the owner's address is a Gmail one, and `checkAddress` refuses
 * anything that is not a school domain. Bolting an exception into that function
 * would put a hole in the one check that decides who is a student — so the
 * admin door is a separate door with a separate lock.
 *
 * Two secrets, both from the environment and neither in the repo:
 * `ADMIN_EMAIL` and `ADMIN_PASSWORD`. With either unset the page does not
 * merely refuse, it does not exist — see `adminConfigured`.
 *
 * The cookie is an HMAC of its own expiry keyed on the password. That gives
 * three things for one line: it cannot be forged without the password, it
 * cannot be replayed past its expiry, and changing the password invalidates
 * every session that was ever issued.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "honk_admin";
const SESSION_HOURS = 12;

function adminEmail(): string | null {
  return process.env.ADMIN_EMAIL?.trim().toLowerCase() || null;
}

function adminPassword(): string | null {
  return process.env.ADMIN_PASSWORD?.trim() || null;
}

/**
 * Both halves or nothing.
 *
 * A half-configured admin page is worse than none: an empty password would
 * otherwise compare equal to an empty submission and let the whole dashboard
 * out to anybody who found the URL.
 */
export function adminConfigured(): boolean {
  const password = adminPassword();
  return adminEmail() !== null && password !== null && password.length >= 8;
}

function equal(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function sign(expiresAt: number): string {
  const password = adminPassword() ?? "";
  return createHmac("sha256", password).update(String(expiresAt)).digest("base64url");
}

export type AdminSignIn = { ok: true } | { ok: false; reason: "not_configured" | "wrong" };

/**
 * Check an email and password pair.
 *
 * Both are compared in constant time, and a wrong address and a wrong password
 * return the same thing — there is no reason to confirm to a stranger which
 * half they got right.
 */
export function checkAdmin(email: string, password: string): AdminSignIn {
  if (!adminConfigured()) return { ok: false, reason: "not_configured" };
  const emailOk = equal(email.trim().toLowerCase(), adminEmail()!);
  const passwordOk = equal(password, adminPassword()!);
  // Both are evaluated before branching, so the reply takes the same shape
  // whichever one failed.
  return emailOk && passwordOk ? { ok: true } : { ok: false, reason: "wrong" };
}

export async function startAdminSession(): Promise<void> {
  const expiresAt = Date.now() + SESSION_HOURS * 60 * 60_000;
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, `${expiresAt}.${sign(expiresAt)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function endAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
}

/** Whether this request carries a valid, unexpired admin cookie. */
export async function isAdmin(): Promise<boolean> {
  if (!adminConfigured()) return false;
  const jar = await cookies();
  const raw = jar.get(ADMIN_COOKIE)?.value;
  if (!raw) return false;

  const [expiresRaw, signature] = raw.split(".");
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  if (!signature) return false;

  return equal(signature, sign(expiresAt));
}
