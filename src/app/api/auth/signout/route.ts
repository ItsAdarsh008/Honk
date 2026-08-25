import { json, requireDatabase } from "@/app/api/_lib";
import { destroySession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST() {
  const unavailable = requireDatabase();
  if (unavailable) return unavailable;
  await destroySession();
  return json({ ok: true });
}
