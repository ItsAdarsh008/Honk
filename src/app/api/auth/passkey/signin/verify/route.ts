import { fail, json, readJson, requireDatabase } from "@/app/api/_lib";
import { takeChallenge } from "@/lib/auth/passkey-challenge";
import { verifyAuthentication } from "@/lib/auth/passkey";
import { createSession, getUserById, hasProfile } from "@/lib/auth/session";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const unavailable = requireDatabase();
  if (unavailable) return unavailable;

  const body = await readJson<{ response?: AuthenticationResponseJSON }>(request);
  const challenge = await takeChallenge("signin");
  if (!body?.response || !challenge) return fail("That didn't work. Try again.");

  const result = await verifyAuthentication(body.response, challenge);
  if (!result.ok) {
    // The same message either way: which passkeys exist is not public.
    return fail("That passkey didn't work. Try again, or use a code.", 401);
  }

  const user = await getUserById(result.userId);
  if (!user) return fail("That passkey didn't work. Try again, or use a code.", 401);

  await createSession(user.id);
  return json({
    ok: true,
    needsProfile: !hasProfile(user),
    verified: user.verifiedAt !== null,
  });
}
