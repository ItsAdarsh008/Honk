import { fail, json, readJson, requireDatabase } from "@/app/api/_lib";
import { getOptionalUser } from "@/lib/auth/current";
import {
  acceptFriend,
  blockUser,
  removeFriend,
  requestFriend,
  unblockUser,
} from "@/lib/friends";

export const runtime = "nodejs";

const ACTIONS = ["request", "accept", "remove", "block", "unblock"] as const;
type Action = (typeof ACTIONS)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const unavailable = requireDatabase();
  if (unavailable) return unavailable;

  const user = await getOptionalUser();
  if (!user) return fail("Sign in first.", 401);

  const body = await readJson<{ action?: string; userId?: string }>(request);
  const action = body?.action as Action | undefined;
  const targetId = body?.userId ?? "";

  if (!action || !ACTIONS.includes(action)) return fail("Unknown action.", 400);
  if (!UUID_RE.test(targetId)) return fail("Unknown person.", 400);
  if (targetId === user.id) return fail("That's you.", 400);

  const result = await (action === "request"
    ? requestFriend(user.id, targetId)
    : action === "accept"
      ? acceptFriend(user.id, targetId)
      : action === "remove"
        ? removeFriend(user.id, targetId)
        : action === "block"
          ? blockUser(user.id, targetId)
          : unblockUser(user.id, targetId));

  if (!result.ok) return fail(result.error ?? "That didn't work.", 400);
  return json({ ok: true, status: result.status });
}
