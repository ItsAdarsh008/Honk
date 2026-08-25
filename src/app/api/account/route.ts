import { fail, json, requireDatabase } from "@/app/api/_lib";
import { deleteAccount } from "@/lib/account";
import { getOptionalUser } from "@/lib/auth/current";
import { destroySession } from "@/lib/auth/session";

export const runtime = "nodejs";

/** Hard delete. Enrollments, friendships and sessions all cascade. */
export async function DELETE() {
  const unavailable = requireDatabase();
  if (unavailable) return unavailable;

  const user = await getOptionalUser();
  if (!user) return fail("Sign in first.", 401);

  await deleteAccount(user.id);
  await destroySession();
  return json({ ok: true });
}
