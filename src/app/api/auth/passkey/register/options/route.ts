import { json, readAddress, readJson, requireDatabase } from "@/app/api/_lib";
import { setChallenge } from "@/lib/auth/passkey-challenge";
import { registrationOptionsFor } from "@/lib/auth/passkey";
import { findOrCreatePasskeyUser, getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";

/**
 * Start making a passkey.
 *
 * Signed in, it adds one to the account already in hand — the second-device
 * case. Signed out, it claims an address and creates an unverified account: a
 * passkey proves a device, not a mailbox, so nothing here is visible to anyone
 * until a code or a Waterloo token verifies it.
 */
export async function POST(request: Request) {
  const unavailable = requireDatabase();
  if (unavailable) return unavailable;

  let user = await getCurrentUser();
  if (!user) {
    const body = await readJson<{ email?: string }>(request);
    const address = readAddress(body?.email);
    if (!address.ok) return address.response;
    user = await findOrCreatePasskeyUser(address.email);
  }

  const options = await registrationOptionsFor(user);
  await setChallenge("register", options.challenge);
  return json({ ok: true, options, userId: user.id });
}
