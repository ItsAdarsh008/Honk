import { fail, json, readJson, requireDatabase } from "@/app/api/_lib";
import { getOptionalUser } from "@/lib/auth/current";
import { deleteSchedule, saveSchedule } from "@/lib/schedule/save";
import { validateSchedule } from "@/lib/schedule/validate";

export const runtime = "nodejs";

/** Save the schedule the user has already reviewed on screen. */
export async function POST(request: Request) {
  const unavailable = requireDatabase();
  if (unavailable) return unavailable;

  const user = await getOptionalUser();
  if (!user) return fail("Sign in first.", 401);

  const body = await readJson<unknown>(request);
  const validated = validateSchedule(body);
  if (!validated.ok) return fail(validated.error, 400);

  try {
    const result = await saveSchedule(user.id, validated.value);
    return json({ ok: true, ...result });
  } catch {
    return fail("That schedule couldn't be saved. Try pasting it again.", 500);
  }
}

/** Hard delete, not a soft flag. */
export async function DELETE(request: Request) {
  const unavailable = requireDatabase();
  if (unavailable) return unavailable;

  const user = await getOptionalUser();
  if (!user) return fail("Sign in first.", 401);

  const body = await readJson<{ termCode?: string }>(request);
  const termCode = typeof body?.termCode === "string" ? body.termCode : undefined;
  const removed = await deleteSchedule(user.id, termCode);
  return json({ ok: true, removed });
}
