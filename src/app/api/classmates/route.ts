import { fail, json, requireDatabase } from "@/app/api/_lib";
import { getOptionalUser } from "@/lib/auth/current";
import { getClassmates } from "@/lib/overlap/queries";

export const runtime = "nodejs";

/**
 * The people in one of your sections.
 *
 * `getClassmates` does the gating: you must be in the section, they must have
 * opted in, and neither of you can have blocked the other. It returns identity
 * only, so no room or meeting time can leave through this route.
 */
export async function GET(request: Request) {
  const unavailable = requireDatabase();
  if (unavailable) return unavailable;

  const user = await getOptionalUser();
  if (!user) return fail("Sign in first.", 401);

  const sectionId = Number(new URL(request.url).searchParams.get("sectionId"));
  if (!Number.isInteger(sectionId) || sectionId <= 0) return fail("Which class?", 400);

  const classmates = await getClassmates(user.id, sectionId);
  return json({ ok: true, classmates });
}
