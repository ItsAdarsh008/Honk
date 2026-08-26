import { clientIp, fail, json, readJson, requireDatabase } from "@/app/api/_lib";
import { checkDailyCapacity } from "@/lib/auth/capacity";
import { deliveryMode, sendLoginCode } from "@/lib/auth/email";
import { checkRateLimit, createLoginCode, normalizeEmail } from "@/lib/auth/session";

export const runtime = "nodejs";

/**
 * Being out of sends for the day is not the same as failing to send, so it
 * gets its own shape. The client renders a card from it rather than a red line
 * under the form — the difference between "Honk is busy" and "Honk is broken".
 */
function atCapacity(retryAfterMinutes: number) {
  const response = json(
    {
      error: "Honk has sent all the sign-in codes it can for today.",
      reason: "at_capacity",
      retryAfterMinutes,
    },
    503,
  );
  response.headers.set("Retry-After", String(retryAfterMinutes * 60));
  return response;
}

/**
 * Issue a sign-in code.
 *
 * The response never says whether an account exists — the same thing comes
 * back either way, so this cannot be used to test who has signed up.
 */
export async function POST(request: Request) {
  // Address check first: it is pure, and it should say the same thing whether
  // or not persistence happens to be configured.
  const body = await readJson<{ email?: string }>(request);
  const email = normalizeEmail(body?.email ?? "");
  if (!email) {
    return fail("Honk is Waterloo-only, so this needs to be a @uwaterloo.ca address.");
  }

  const unavailable = requireDatabase();
  if (unavailable) return unavailable;

  const ip = clientIp(request);
  // Per-caller limits before the global one, so somebody hammering the endpoint
  // is told it was them rather than being handed the "we're full" message.
  const limit = await checkRateLimit(email, ip);
  if (!limit.ok) {
    return fail(
      limit.reason === "email"
        ? "That's a lot of codes for one address. Try again in an hour."
        : "Too many codes requested from here. Try again in an hour.",
      429,
    );
  }

  const capacity = await checkDailyCapacity();
  if (!capacity.ok) return atCapacity(capacity.retryAfterMinutes);

  const code = await createLoginCode(email, ip);
  const delivery = await sendLoginCode(email, code);

  if (!delivery.ok) {
    // The provider's own ceiling, reached before ours — same story for the user.
    if (delivery.reason === "capacity") return atCapacity(60);
    return fail("The code couldn't be sent. Try again in a moment.", 502);
  }

  return json({ ok: true, email, mode: deliveryMode() });
}
