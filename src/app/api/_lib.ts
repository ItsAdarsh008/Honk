import "server-only";
import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { checkAddress } from "@/lib/auth/session";
import { liveSchoolSummary } from "@/lib/schools";

export function json<T>(body: T, status = 200) {
  return NextResponse.json(body, { status });
}

export function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

/** Coarse client IP, used only for rate limiting. Never stored with a schedule. */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return request.headers.get("x-real-ip");
}

/** Every route degrades to a plain message rather than a stack trace. */
export function requireDatabase() {
  if (hasDatabase()) return null;
  return fail("Honk isn't connected to a database yet, so accounts are switched off.", 503);
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * School addresses
 * ------------------------------------------------------------------ */

export type AddressResult =
  | { ok: true; email: string; schoolId: string }
  | { ok: false; response: NextResponse };

/**
 * Read a school address off a request body, or produce the refusal.
 *
 * One place, because every auth route needs it and they were each carrying
 * their own copy of a sentence with "@uwaterloo.ca" hard-coded in it.
 *
 * The two refusals are deliberately different. An address at no university
 * Honk knows is a plain no. An address at a university Honk knows and has not
 * launched at is an invitation: the response carries the school so the sign-in
 * screen can offer them the beta rather than a red line under the box.
 */
export function readAddress(raw: string | undefined | null): AddressResult {
  const checked = checkAddress(raw ?? "");
  if (checked.ok) return { ok: true, email: checked.email, schoolId: checked.school.id };

  if (checked.reason === "not_live") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Honk isn't at ${checked.school.short} yet — but it could be.`,
          reason: "school_not_live",
          school: { id: checked.school.id, name: checked.school.name, short: checked.school.short },
        },
        { status: 403 },
      ),
    };
  }

  return {
    ok: false,
    response: fail(`Honk needs a university email — ${liveSchoolSummary()}. See /universities.`),
  };
}
