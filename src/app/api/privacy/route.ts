import { fail, json, readJson, requireDatabase } from "@/app/api/_lib";
import { markPrivacyPrompted, setDiscoverable } from "@/lib/account";
import { getOptionalUser } from "@/lib/auth/current";

export const runtime = "nodejs";

/**
 * The discoverability switch. Answering the prompt either way records that it
 * has been answered, so it is asked exactly once.
 */
export async function POST(request: Request) {
  const unavailable = requireDatabase();
  if (unavailable) return unavailable;

  const user = await getOptionalUser();
  if (!user) return fail("Sign in first.", 401);

  const body = await readJson<{ discoverable?: unknown }>(request);
  if (typeof body?.discoverable !== "boolean") return fail("Yes or no?", 400);

  if (body.discoverable) {
    await setDiscoverable(user.id, true);
  } else if (user.discoverable) {
    await setDiscoverable(user.id, false);
  } else {
    // Already hidden — just record that the question has been asked.
    await markPrivacyPrompted(user.id);
  }

  return json({ ok: true, discoverable: body.discoverable });
}
