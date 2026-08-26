import { json, requireDatabase } from "@/app/api/_lib";
import { setChallenge } from "@/lib/auth/passkey-challenge";
import { authenticationOptions } from "@/lib/auth/passkey";

export const runtime = "nodejs";

/**
 * No address is asked for and none is needed: the browser offers whatever
 * passkey it holds for this site. That is also why this cannot be used to test
 * who has an account — it says the same thing to everyone.
 */
export async function POST() {
  const unavailable = requireDatabase();
  if (unavailable) return unavailable;

  const options = await authenticationOptions();
  await setChallenge("signin", options.challenge);
  return json({ ok: true, options });
}
