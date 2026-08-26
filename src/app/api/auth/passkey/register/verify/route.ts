import { fail, json, readJson, requireDatabase } from "@/app/api/_lib";
import { takeChallenge } from "@/lib/auth/passkey-challenge";
import { saveRegistration } from "@/lib/auth/passkey";
import { createSession, getCurrentUser, getUserById, hasProfile } from "@/lib/auth/session";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const unavailable = requireDatabase();
  if (unavailable) return unavailable;

  const body = await readJson<{ userId?: string; response?: RegistrationResponseJSON }>(request);
  const challenge = await takeChallenge("register");
  if (!body?.response || !challenge) return fail("That didn't complete. Try again.");

  // Signed in, the account is whoever is signed in. Signed out, it is the one
  // the options step just claimed — never a userId the browser made up.
  const current = await getCurrentUser();
  const userId = current?.id ?? body.userId;
  if (!userId) return fail("That didn't complete. Try again.");

  const user = await getUserById(userId);
  if (!user) return fail("That didn't complete. Try again.");

  const saved = await saveRegistration(user.id, body.response, challenge);
  if (!saved.ok) return fail("That passkey couldn't be saved. Try again.", 400);

  if (!current) await createSession(user.id);

  return json({
    ok: true,
    needsProfile: !hasProfile(user),
    verified: user.verifiedAt !== null,
  });
}
