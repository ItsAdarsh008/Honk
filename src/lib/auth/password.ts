import "server-only";

/**
 * Site-local passwords.
 *
 * scrypt from `node:crypto` rather than a bcrypt or argon2 dependency: it is
 * memory-hard, it is in the standard library, and it needs no native build on
 * Vercel. The parameters below are the Node defaults scaled up; the cost is
 * roughly a tenth of a second per attempt, which is invisible to a person
 * signing in and expensive for anybody trying every password in a list.
 *
 * The rules are deliberately not draconian. Length is the only thing that
 * reliably predicts strength, and composition rules — an uppercase, a digit, a
 * symbol — mostly produce `Password1!` and a sticky note. This is also what
 * NIST has recommended since SP 800-63B: a minimum length, a generous maximum,
 * and no forced pattern.
 */

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// promisify picks the 3-arg overload; scrypt with options needs the 4-arg one.
const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

/** Deliberately the only rule. */
export const MIN_PASSWORD_LENGTH = 8;
/** Long enough for any passphrase, short enough that hashing stays cheap. */
export const MAX_PASSWORD_LENGTH = 200;

const KEY_LENGTH = 64;
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;

export type PasswordProblem = "too_short" | "too_long" | "blank";

export function checkPassword(raw: string): PasswordProblem | null {
  if (!raw.trim()) return "blank";
  if (raw.length < MIN_PASSWORD_LENGTH) return "too_short";
  if (raw.length > MAX_PASSWORD_LENGTH) return "too_long";
  return null;
}

export const PASSWORD_MESSAGES: Record<PasswordProblem, string> = {
  blank: "Pick a password.",
  too_short: `At least ${MIN_PASSWORD_LENGTH} characters. Length is the only rule.`,
  too_long: `That is over ${MAX_PASSWORD_LENGTH} characters.`,
};

/** `scrypt$cost$blockSize$parallelism$salt$hash`, all base64url. */
export async function hashPassword(raw: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(raw.normalize("NFKC"), salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELISM,
  });
  return [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

/**
 * Constant-time in the comparison, and never throws on a malformed stored
 * value — a corrupt row should refuse the sign-in, not crash the route.
 */
export async function verifyPassword(raw: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, cost, blockSize, parallelism, salt, expected] = parts;
  try {
    const expectedBuf = Buffer.from(expected, "base64url");
    const derived = await scrypt(raw.normalize("NFKC"), Buffer.from(salt, "base64url"), expectedBuf.length, {
      N: Number(cost),
      r: Number(blockSize),
      p: Number(parallelism),
    });
    return derived.length === expectedBuf.length && timingSafeEqual(derived, expectedBuf);
  } catch {
    return false;
  }
}
