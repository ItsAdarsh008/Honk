import { clientIp, fail, json, readJson, requireDatabase } from "@/app/api/_lib";
import { deliveryMode, sendLoginCode } from "@/lib/auth/email";
import { checkRateLimit, createLoginCode, normalizeEmail } from "@/lib/auth/session";

export const runtime = "nodejs";

/**
 * Issue a sign-in code.
 *
 * The response never says whether an account exists — the same thing comes
 * back either way, so this cannot be used to test who has signed up.
 */
export async function POST(request: Request) {
  const unavailable = requireDatabase();
  if (unavailable) return unavailable;

  const body = await readJson<{ email?: string }>(request);
  const email = normalizeEmail(body?.email ?? "");
  if (!email) {
    return fail("Honk is Waterloo-only, so this needs to be a @uwaterloo.ca address.");
  }

  const ip = clientIp(request);
  const limit = await checkRateLimit(email, ip);
  if (!limit.ok) {
    return fail(
      limit.reason === "email"
        ? "That's a lot of codes for one address. Try again in an hour."
        : "Too many codes requested from here. Try again in an hour.",
      429,
    );
  }

  const code = await createLoginCode(email, ip);
  const delivery = await sendLoginCode(email, code);

  if (!delivery.ok) {
    return fail("The code couldn't be sent. Try again in a moment.", 502);
  }

  return json({ ok: true, email, mode: deliveryMode() });
}
