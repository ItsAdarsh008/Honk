import { fail, json, readJson, requireDatabase } from "@/app/api/_lib";
import { getOptionalUser } from "@/lib/auth/current";
import {
  createStudyGroup,
  joinStudyGroup,
  leaveStudyGroup,
  listGroupsForSection,
  listGroupMembers,
} from "@/lib/study-groups";

export const runtime = "nodejs";

/**
 * Study groups for one of your sections.
 *
 * Every check lives in `lib/study-groups.ts`, and the only one that matters is
 * that you are in the class: a section you are not enrolled in comes back as
 * an empty list rather than a refusal, because a refusal would confirm that
 * the section exists and has groups in it.
 */
export async function GET(request: Request) {
  const unavailable = requireDatabase();
  if (unavailable) return unavailable;

  const user = await getOptionalUser();
  if (!user) return fail("Sign in first.", 401);

  const params = new URL(request.url).searchParams;
  const sectionId = Number(params.get("sectionId"));
  if (!Number.isInteger(sectionId) || sectionId <= 0) return fail("Which class?", 400);

  const groups = await listGroupsForSection(user.id, sectionId);

  // The members of the one you are in, so the panel can name them without a
  // second round trip. Groups you have not joined return a count and no names.
  const mine = groups.find((group) => group.joined);
  const members = mine ? await listGroupMembers(user.id, mine.id) : [];

  return json({ ok: true, groups, members });
}

interface Body {
  action?: string;
  sectionId?: number;
  groupId?: number;
  name?: string;
}

export async function POST(request: Request) {
  const unavailable = requireDatabase();
  if (unavailable) return unavailable;

  const user = await getOptionalUser();
  if (!user) return fail("Sign in first.", 401);

  const body = await readJson<Body>(request);
  if (!body) return fail("That didn't parse.", 400);

  const int = (value: unknown) =>
    Number.isInteger(value) && (value as number) > 0 ? (value as number) : null;

  if (body.action === "create") {
    const sectionId = int(body.sectionId);
    if (!sectionId) return fail("Which class?", 400);
    const result = await createStudyGroup(user.id, sectionId, body.name ?? "");
    return result.ok ? json({ ok: true, groupId: result.groupId }) : fail(result.error!, 400);
  }

  const groupId = int(body.groupId);
  if (!groupId) return fail("Which group?", 400);

  if (body.action === "join") {
    const result = await joinStudyGroup(user.id, groupId);
    return result.ok ? json({ ok: true, groupId }) : fail(result.error!, 400);
  }

  if (body.action === "leave") {
    await leaveStudyGroup(user.id, groupId);
    return json({ ok: true });
  }

  return fail("Unknown action.", 400);
}
