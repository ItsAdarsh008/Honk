import { fail, json, readAddress, readJson, requireDatabase } from "@/app/api/_lib";
import { checkPin, hashPin, PIN_MESSAGES, verifyPin } from "@/lib/auth/pin";
import {
  clearFailedLogins,
  createPinUser,
  createSession,
  findUserForSignIn,
  hasProfile,
  lockoutRemaining,
  recordFailedLogin,
} from "@/lib/auth/session";

export const runtime = "nodejs";

/**
 * Sign up or sign in with an address and a five-digit PIN.
 *
 * One route for both, because the client cannot know which it is: somebody
 * typing their address does not remember whether they made an account. `mode`
 * says what happened so the screen can ask for a name or not.
 *
 * A wrong PIN and an address with no account say the same thing, so this
 * cannot be used to find out who has signed up.
 */
export async function POST(request: Request) {
  const unavailable = requireDatabase();
  if (unavailable) return unavailable;

  const body = await readJson<{ email?: string; pin?: string }>(request);
  const address = readAddress(body?.email);
  if (!address.ok) return address.response;
  const email = address.email;
  const pin = body?.pin ?? "";

  const existing = await findUserForSignIn(email);

  if (existing?.pinHash) {
    const locked = lockoutRemaining(existing);
    if (locked !== null) {
      return fail(
        locked >= 60
          ? `Too many wrong tries. Try again in about ${Math.round(locked / 60)} ${Math.round(locked / 60) === 1 ? "hour" : "hours"}.`
          : `Too many wrong tries. Try again in ${locked} ${locked === 1 ? "minute" : "minutes"}.`,
        429,
      );
    }

    if (!(await verifyPin(pin, existing.pinHash))) {
      await recordFailedLogin(existing);
      return fail("That email and PIN don't match.", 401);
    }

    await clearFailedLogins(existing);
    await createSession(existing.id);
    return json({ ok: true, mode: "signin", needsProfile: !hasProfile(existing) });
  }

  // No PIN on file: this is a signup, so the rules apply now.
  const problem = checkPin(pin);
  if (problem) return fail(PIN_MESSAGES[problem]);

  const created = await createPinUser(email, await hashPin(pin));
  if (!created.ok) return fail("That email and PIN don't match.", 401);

  await createSession(created.user.id);
  return json({ ok: true, mode: "signup", needsProfile: !hasProfile(created.user) });
}
