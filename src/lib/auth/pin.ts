import "server-only";

/**
 * A five-digit PIN, local to Honk.
 *
 * The point is what it *cannot* be. A password box next to a `@uwaterloo.ca`
 * address invites people to type their WatIAM password, and if Honk is ever
 * breached that leaks credentials which work on university systems. Five digits
 * cannot be a WatIAM password, so the reuse simply does not arise.
 *
 * The cost is honest: 100,000 possibilities is not much. It is not secret
 * enough to protect a bank, and after a database breach every PIN is
 * recoverable no matter how it is hashed — scrypt buys hours, not safety. What
 * makes it workable is that the online path is throttled hard and the
 * guessable PINs are refused, and that what sits behind it is a class schedule
 * the owner chose to share, further gated by mutual consent.
 *
 * The hash is still scrypt and still salted. Against an offline attack on a
 * five-digit space that is close to decorative, but it costs nothing and it
 * means a leaked table is not a list of plaintext PINs.
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

export const PIN_LENGTH = 5;

const KEY_LENGTH = 64;
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;

export type PinProblem = "wrong_length" | "not_digits" | "too_guessable";

/**
 * The only PINs refused are the ones an attacker would try first.
 *
 * A per-account lockout does nothing against spraying — one guess each across
 * hundreds of accounts — and spraying only works because a few PINs are wildly
 * over-chosen. Refusing those is what actually defeats it, which makes this
 * worth more than the handful of characters it costs.
 */
function tooGuessable(pin: string): boolean {
  if (/^(\d)\1{4}$/.test(pin)) return true; // 11111, 00000

  const digits = [...pin].map(Number);
  const step = digits[1] - digits[0];
  if ((step === 1 || step === -1) && digits.every((d, i) => i === 0 || d - digits[i - 1] === step)) {
    return true; // 12345, 54321
  }

  return ["13579", "24680", "12321", "10101", "98765", "01234"].includes(pin);
}

export function checkPin(raw: string): PinProblem | null {
  const pin = raw.trim();
  if (pin.length !== PIN_LENGTH) return "wrong_length";
  if (!/^\d{5}$/.test(pin)) return "not_digits";
  if (tooGuessable(pin)) return "too_guessable";
  return null;
}

export const PIN_MESSAGES: Record<PinProblem, string> = {
  wrong_length: `A PIN is ${PIN_LENGTH} digits.`,
  not_digits: "Digits only.",
  too_guessable: "That one is too easy to guess. Try something less obvious.",
};

/** `scrypt$cost$blockSize$parallelism$salt$hash`, all base64url. */
export async function hashPin(raw: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(raw.trim(), salt, KEY_LENGTH, {
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
export async function verifyPin(raw: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, cost, blockSize, parallelism, salt, expected] = parts;
  try {
    const expectedBuf = Buffer.from(expected, "base64url");
    const derived = await scrypt(raw.trim(), Buffer.from(salt, "base64url"), expectedBuf.length, {
      N: Number(cost),
      r: Number(blockSize),
      p: Number(parallelism),
    });
    return derived.length === expectedBuf.length && timingSafeEqual(derived, expectedBuf);
  } catch {
    return false;
  }
}

/**
 * How long a wrong PIN costs, by how many have been wrong in a row.
 *
 * Escalating, because the search space is small enough that a flat "fifteen
 * minutes" would still allow a thousand guesses a day — a one percent chance
 * per day of hitting a given PIN, which over a term is not a small number. The
 * count only resets on a correct PIN, so a patient attacker ends up waiting a
 * day per five guesses while somebody who fat-fingered theirs waits nothing.
 */
export function lockoutMinutes(consecutiveFailures: number): number | null {
  if (consecutiveFailures < 5) return null;
  if (consecutiveFailures < 10) return 15;
  if (consecutiveFailures < 15) return 60;
  if (consecutiveFailures < 20) return 6 * 60;
  return 24 * 60;
}
