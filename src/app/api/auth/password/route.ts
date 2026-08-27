import { fail, json, readJson, requireDatabase } from "@/app/api/_lib";
import {
  checkPassword,
  hashPassword,
  PASSWORD_MESSAGES,
  verifyPassword,
} from "@/lib/auth/password";
import {
  clearFailedLogins,
  createPasswordUser,
  createSession,
  findUserForSignIn,
  hasProfile,
  lockoutRemaining,
  normalizeEmail,
  recordFailedLogin,
} from "@/lib/auth/session";

export const runtime = "nodejs";

/**
 * Sign up or sign in with an address and a password.
 *
 * One route for both, because the client cannot know which it is: somebody
 * typing their address does not remember whether they made an account. `mode`
 * says what happened so the screen can say "welcome back" or ask for a name.
 *
 * A wrong password and an address with no account say the same thing, so this
 * cannot be used to find out who has signed up.
 */
export async function POST(request: Request) {
  const unavailable = requireDatabase();
  if (unavailable) return unavailable;

  const body = await readJson<{ email?: string; password?: string }>(request);
  const email = normalizeEmail(body?.email ?? "");
  const password = body?.password ?? "";

  if (!email) {
    return fail("Honk is Waterloo-only, so this needs to be a @uwaterloo.ca address.");
  }

  const existing = await findUserForSignIn(email);

  if (existing?.passwordHash) {
    const locked = lockoutRemaining(existing);
    if (locked !== null) {
      return fail(
        `Too many wrong tries. Try again in ${locked} ${locked === 1 ? "minute" : "minutes"}.`,
        429,
      );
    }

    if (!(await verifyPassword(password, existing.passwordHash))) {
      await recordFailedLogin(existing);
      return fail("That email and password don't match.", 401);
    }

    await clearFailedLogins(existing);
    await createSession(existing.id);
    return json({ ok: true, mode: "signin", needsProfile: !hasProfile(existing) });
  }

  // No password on file: this is a signup, so the rules apply now.
  const problem = checkPassword(password);
  if (problem) return fail(PASSWORD_MESSAGES[problem]);

  const created = await createPasswordUser(email, await hashPassword(password));
  if (!created.ok) return fail("That email and password don't match.", 401);

  await createSession(created.user.id);
  return json({ ok: true, mode: "signup", needsProfile: !hasProfile(created.user) });
}
