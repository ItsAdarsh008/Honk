import { fail, json, readJson } from "@/app/api/_lib";
import { adminConfigured, checkAdmin, startAdminSession } from "@/lib/admin/auth";

export const runtime = "nodejs";

/**
 * A deliberate delay on every attempt, success or failure.
 *
 * There is one account and it is protected by one password, so the whole
 * defence is making guesses expensive. Half a second is imperceptible to
 * somebody typing their own password and turns an online brute force into
 * something that takes longer than the password is worth.
 *
 * It is not a lockout. A serverless instance has no memory between requests to
 * count attempts in, so a counter here would be honest-looking and useless —
 * better an even cost on every attempt than a limit that resets whenever the
 * platform starts a new instance.
 */
const DELAY_MS = 500;

export async function POST(request: Request) {
  if (!adminConfigured()) {
    return fail("The admin page isn't switched on. Set ADMIN_EMAIL and ADMIN_PASSWORD.", 404);
  }

  const body = await readJson<{ email?: string; password?: string }>(request);
  await new Promise((resolve) => setTimeout(resolve, DELAY_MS));

  const result = checkAdmin(body?.email ?? "", body?.password ?? "");
  if (!result.ok) return fail("That email and password don't match.", 401);

  await startAdminSession();
  return json({ ok: true });
}
