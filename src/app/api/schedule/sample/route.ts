import { fail, json, readJson, requireDatabase } from "@/app/api/_lib";
import { getOptionalUser } from "@/lib/auth/current";
import { MAX_SAMPLE_CHARS, recordPasteSample } from "@/lib/schedule/samples";
import { getSchool } from "@/lib/schools";
import type { ParseWarning } from "@/lib/schedule/types";

export const runtime = "nodejs";

/**
 * A paste the parser could not read.
 *
 * Sent by the paste screen, and only when the reading failed — see
 * `shouldRecordPaste`, which is where the rule about what is worth keeping
 * lives. This route enforces the same rule again rather than trusting the
 * client to have applied it.
 *
 * Signed out is allowed on purpose. A student pastes first and makes an account
 * afterwards, so the failures worth having mostly happen before there is a
 * session to attach them to. Nothing about the caller is stored either way:
 * no user id, no IP, only the text and which school's portal it came from.
 */
interface Body {
  schoolId?: unknown;
  parser?: unknown;
  rawText?: unknown;
  courseCount?: unknown;
  warnings?: unknown;
}

/** Trust only the two ids the parsers actually answer to. */
function readParser(value: unknown): string | null {
  return value === "generic" || value === "peoplesoft" ? value : null;
}

/**
 * Warnings are echoed back by the client, so they are rebuilt field by field
 * rather than stored as handed over.
 */
function readWarnings(value: unknown): ParseWarning[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 200).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const w = entry as Record<string, unknown>;
    return [
      {
        line: Number.isFinite(w.line) ? Number(w.line) : 0,
        text: typeof w.text === "string" ? w.text.slice(0, 500) : "",
        reason: typeof w.reason === "string" ? w.reason.slice(0, 200) : "",
      },
    ];
  });
}

export async function POST(request: Request) {
  const unavailable = requireDatabase();
  if (unavailable) return unavailable;

  const body = await readJson<Body>(request);
  if (!body) return fail("Nothing to record.", 400);

  const rawText = typeof body.rawText === "string" ? body.rawText : "";
  // Below this it is a stray keystroke, not a schedule somebody tried to paste.
  if (rawText.trim().length < 40) return json({ ok: true, stored: false });

  const parser = readParser(body.parser);
  if (!parser) return fail("Unknown parser.", 400);

  /*
   * The account's school wins when there is one, matching the save route: a
   * schedule belongs to the campus whose address created the account. Only a
   * signed-out paste may name its own, and then only a school Honk knows.
   */
  const user = await getOptionalUser();
  const claimed = typeof body.schoolId === "string" ? body.schoolId : null;
  const schoolId = user?.schoolId ?? (claimed && getSchool(claimed) ? claimed : null);
  if (!schoolId) return fail("Unknown school.", 400);

  const courseCount = Number.isFinite(body.courseCount) ? Number(body.courseCount) : 0;

  try {
    const stored = await recordPasteSample({
      schoolId,
      parser,
      rawText: rawText.slice(0, MAX_SAMPLE_CHARS),
      courseCount,
      warnings: readWarnings(body.warnings),
    });
    return json({ ok: true, stored });
  } catch {
    // A sample is diagnostic. Failing to keep one must never surface to the
    // student, who is already looking at a paste that did not work.
    return json({ ok: true, stored: false });
  }
}
