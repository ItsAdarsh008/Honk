import { fail, json, readJson, requireDatabase } from "@/app/api/_lib";
import { getOptionalUser } from "@/lib/auth/current";
import { setProfile } from "@/lib/auth/session";

export const runtime = "nodejs";

const MESSAGES: Record<string, string> = {
  bad_name: "Names can be up to 40 characters.",
  bad_handle: "Handles use letters, numbers and underscores, 2 to 20 characters.",
  handle_taken: "That handle is taken. Try another.",
};

/** Display name and handle. Nothing else is ever asked for. */
export async function POST(request: Request) {
  const unavailable = requireDatabase();
  if (unavailable) return unavailable;

  const user = await getOptionalUser();
  if (!user) return fail("Sign in first.", 401);

  const body = await readJson<{ displayName?: string; handle?: string }>(request);
  const result = await setProfile(user.id, body?.displayName ?? "", body?.handle ?? "");
  if (!result.ok) return fail(MESSAGES[result.reason] ?? "That didn't work.", 400);

  return json({ ok: true, handle: result.user.handle, displayName: result.user.displayName });
}
