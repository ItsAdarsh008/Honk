import "server-only";

/**
 * Signing in with a passkey.
 *
 * The account is created by the device credential, not by a code arriving, so
 * getting into Honk no longer depends on a mail gateway nobody here controls.
 * Only the public key is ever stored.
 *
 * What this deliberately does *not* do is prove the address belongs to the
 * person typing it. Waterloo offers exactly two ways to prove that — a code to
 * the mailbox, or a token from the directory — and a passkey is neither. So a
 * passkey account starts unverified, `verifiedAt` stays null, and every social
 * read in the app already refuses to show it: see `isNotNull(users.verifiedAt)`
 * in `overlap/queries.ts`, `invite.ts` and `stats.ts`. Somebody can claim an
 * address that is not theirs; what they get for it is an account nobody can
 * see.
 */

import { and, eq } from "drizzle-orm";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { getDb, type Db } from "../db";
import { credentials } from "../db/schema";
import type { User } from "../db/schema";
import { siteUrl } from "../site";

export const RP_NAME = "Honk";

/**
 * The origin the credential is bound to. A passkey made on one hostname will
 * not work on another, which is why `NEXT_PUBLIC_SITE_URL` being pinned
 * matters more now than it did for link previews.
 */
export function rpOrigin(): string {
  return siteUrl();
}

export function rpId(): string {
  return new URL(rpOrigin()).hostname;
}

/* ------------------------------------------------------------------ *
 * Registration
 * ------------------------------------------------------------------ */

export async function registrationOptionsFor(user: User, db: Db = getDb()) {
  const existing = await db
    .select({ credentialId: credentials.credentialId, transports: credentials.transports })
    .from(credentials)
    .where(eq(credentials.userId, user.id));

  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rpId(),
    userName: user.email,
    userDisplayName: user.displayName ?? user.email,
    attestationType: "none",
    // Stops the same device silently making a second credential for one account.
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: c.transports ? (JSON.parse(c.transports) as never) : undefined,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });
}

export async function saveRegistration(
  userId: string,
  response: RegistrationResponseJSON,
  expectedChallenge: string,
  db: Db = getDb(),
): Promise<{ ok: true } | { ok: false; reason: string }> {
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: rpOrigin(),
      expectedRPID: rpId(),
      requireUserVerification: false,
    });
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "verify failed" };
  }

  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false, reason: "not verified" };
  }

  const { credential } = verification.registrationInfo;
  await db.insert(credentials).values({
    userId,
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: response.response.transports
      ? JSON.stringify(response.response.transports)
      : null,
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Authentication
 * ------------------------------------------------------------------ */

/**
 * No `allowCredentials`: the browser offers whatever passkey it holds for this
 * site and the user picks. Listing credentials for an address would turn this
 * endpoint into a way to test who has an account.
 */
export async function authenticationOptions() {
  return generateAuthenticationOptions({
    rpID: rpId(),
    userVerification: "preferred",
  });
}

/**
 * Returns an id, not a row. Reads of `users` stay inside `session.ts` so the
 * architectural guard in `privacy-boundary.test.ts` keeps meaning something.
 */
export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "unknown_credential" | "bad_response" };

export async function verifyAuthentication(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  db: Db = getDb(),
): Promise<AuthResult> {
  const [row] = await db
    .select()
    .from(credentials)
    .where(eq(credentials.credentialId, response.id))
    .limit(1);
  if (!row) return { ok: false, reason: "unknown_credential" };

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: rpOrigin(),
      expectedRPID: rpId(),
      credential: {
        id: row.credentialId,
        publicKey: new Uint8Array(Buffer.from(row.publicKey, "base64url")),
        counter: row.counter,
        transports: row.transports ? (JSON.parse(row.transports) as never) : undefined,
      },
      requireUserVerification: false,
    });
  } catch {
    return { ok: false, reason: "bad_response" };
  }

  if (!verification.verified) return { ok: false, reason: "bad_response" };

  await db
    .update(credentials)
    .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(and(eq(credentials.id, row.id)));

  return { ok: true, userId: row.userId };
}

export async function hasPasskey(userId: string, db: Db = getDb()): Promise<boolean> {
  const [row] = await db
    .select({ id: credentials.id })
    .from(credentials)
    .where(eq(credentials.userId, userId))
    .limit(1);
  return Boolean(row);
}
