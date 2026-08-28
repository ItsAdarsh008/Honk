/**
 * The shape every schedule parser produces.
 *
 * Honk reads five portals now and they agree on almost nothing — column
 * layout, day abbreviations, whether times carry AM/PM, whether a section even
 * has a number. What they do agree on is the thing underneath: a course, split
 * into sections, each meeting on some days at some times in some room. That is
 * this file, and it is all the rest of the app ever sees.
 *
 * Pure types plus two pure functions. No I/O, so the parsers stay runnable in
 * the browser and the raw paste never has to reach the server before the user
 * has seen what was read out of it.
 */

export interface ParsedMeeting {
  /** 1 = Monday ... 7 = Sunday */
  weekday: number;
  /** Minutes from midnight, campus-local. */
  startMin: number;
  endMin: number;
  /** Null when the portal said TBA, or printed no room at all. */
  location: string | null;
}

export type CourseStatus = "enrolled" | "dropped" | "waitlisted" | "unknown";

export interface ParsedSection {
  /**
   * The portal's own unique number for this class.
   *
   * PeopleSoft prints one (Quest's "Class Nbr", Mosaic's the same) and it is
   * unique within a term, which is what made section identity trivial when
   * Waterloo was the only school. Nothing else prints one, so this is null for
   * most of the country and `sectionKeyFor` supplies the identity instead.
   */
  classNumber: number | null;
  sectionCode: string;
  /**
   * True when the section code was not printed anywhere and had to be made up.
   *
   * It still renders — a card saying "LEC 01" is better than one saying "LEC"
   * — but it must not be used to decide which section this *is*. See
   * `sectionKeyFor`.
   */
  sectionCodeInferred?: boolean;
  component: string;
  instructor: string | null;
  /** ISO yyyy-mm-dd, or null when the portal said TBA. */
  startDate: string | null;
  endDate: string | null;
  meetings: ParsedMeeting[];
}

export interface ParsedCourse {
  subject: string;
  catalog: string;
  title: string | null;
  status: CourseStatus;
  sections: ParsedSection[];
}

export interface ParseWarning {
  /** 1-indexed line number in the original paste; 0 for course-level notes. */
  line: number;
  text: string;
  reason: string;
}

export interface ParseResult {
  courses: ParsedCourse[];
  warnings: ParseWarning[];
  /** Honk's own term code derived from section dates, e.g. "1269". */
  termCode: string | null;
}

/**
 * The identity of a section within one school and term.
 *
 * Two students in the same lecture must land on the same `sections` row — that
 * is what makes finding classmates an index lookup instead of a comparison of
 * meeting times, and it is why one person's paste fixes a room number for
 * everyone else in the room.
 *
 * Where the portal prints a class number, that number *is* the identity and
 * nothing else is as reliable: it survives a renamed component and a section
 * code typed in a different case. Everywhere else the identity has to be built
 * out of what is printed, and the course plus the component plus the section
 * code is the narrowest thing that is stable between two people looking at the
 * same class.
 *
 * The two forms cannot collide: a class number key is digits only, and the
 * built key always contains a dot.
 */
export function sectionKeyFor(
  subject: string,
  catalog: string,
  section: Pick<
    ParsedSection,
    "classNumber" | "component" | "sectionCode" | "sectionCodeInferred" | "meetings"
  >,
): string {
  if (section.classNumber !== null) return String(section.classNumber);

  const base = [subject, catalog, section.component]
    .map((part) => part.trim().toUpperCase())
    .join(".");

  /*
   * When the portal printed no section code, the meeting pattern is the
   * identity instead.
   *
   * The alternative — defaulting to "01" — quietly merges every unnumbered
   * lecture of a course into one row. Because section rows are shared between
   * students, that does not just mislabel something: two people in genuinely
   * different lectures become each other's classmates, and being classmates is
   * what lets a friend see a room. A parsing guess must never be able to widen
   * who can see where somebody will be.
   *
   * The trade is real and points the safe way. Keying on the pattern means two
   * pastes of the same lecture that disagree about one meeting row land on
   * different keys and fail to merge, so somebody sees fewer classmates than
   * they should. That is invisible and harmless. The other failure is neither.
   */
  if (section.sectionCodeInferred) {
    const pattern = section.meetings
      .map((m) => `${m.weekday}:${m.startMin}-${m.endMin}`)
      .sort()
      .join(",");
    return `${base}.@${pattern}`;
  }

  return `${base}.${section.sectionCode.trim().toUpperCase()}`;
}

/** The meeting pattern, as the string that stands in for a section's identity. */
function patternOf(section: Pick<ParsedSection, "meetings">): string {
  return section.meetings
    .map((m) => `${m.weekday}:${m.startMin}-${m.endMin}`)
    .sort()
    .join(",");
}

export interface ResolvedKeys {
  keys: Map<ParsedSection, string>;
  /** Sections that are the same class listed twice, and can be dropped. */
  duplicates: Set<ParsedSection>;
}

/**
 * Section keys for a whole schedule, with collisions settled.
 *
 * `sectionKeyFor` decides one section's identity in isolation, which is right
 * until two sections in the same paste land on the same key. That used to be
 * treated as a corrupt payload and rejected the entire schedule — a real
 * student at York could not save a term because of it, and the message he got
 * ("that schedule lists the same class twice") described something that was
 * not true of his timetable.
 *
 * Two sections in one person's paste that share a key are one of two things,
 * and neither is a reason to refuse the paste:
 *
 *  - **The same class printed twice.** Identical meeting patterns. One is
 *    dropped; nothing is lost.
 *  - **Two different parts of one course** the parser could not tell apart —
 *    an unrecognised component code, or a portal that prints the same section
 *    number against both. Their meeting patterns differ, because they meet at
 *    different times, so the pattern is what separates them.
 *
 * Re-keying is applied to *every* member of a colliding group rather than to
 * the newcomer, so the result does not depend on the order the portal happened
 * to print them in. Two students in the same pair of components produce the
 * same pair of keys and still land on the same shared rows.
 */
export function resolveSectionKeys(courses: ParsedCourse[]): ResolvedKeys {
  const keys = new Map<ParsedSection, string>();
  const duplicates = new Set<ParsedSection>();
  const groups = new Map<string, Array<{ section: ParsedSection; course: ParsedCourse }>>();

  for (const course of courses) {
    for (const section of course.sections) {
      const key = sectionKeyFor(course.subject, course.catalog, section);
      keys.set(section, key);
      const group = groups.get(key) ?? [];
      group.push({ section, course });
      groups.set(key, group);
    }
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const seen = new Map<string, ParsedSection>();
    for (const { section, course } of group) {
      const pattern = patternOf(section);
      const first = seen.get(pattern);
      if (first) {
        // Same key, same times: the same class, listed twice.
        duplicates.add(section);
        continue;
      }
      seen.set(pattern, section);
      keys.set(
        section,
        `${sectionKeyFor(course.subject, course.catalog, section)}.@${pattern}`,
      );
    }

    // A group that turned out to be one class repeated needs no re-keying.
    if (seen.size === 1) {
      for (const [, section] of seen) {
        const course = group.find((g) => g.section === section)!.course;
        keys.set(section, sectionKeyFor(course.subject, course.catalog, section));
      }
    }
  }

  return { keys, duplicates };
}

/**
 * Honk's term code: `1` + two-digit year + season digit (1 = Winter, 5 =
 * Spring/Summer, 9 = Fall). Fall 2026 is `1269`.
 *
 * This is Waterloo's own format, kept as the internal one rather than storing
 * each school's. Every school codes terms differently and none of the codes
 * mean anything to a student, so Honk needs exactly one rule it can derive
 * from a date — and this one already had a year of rows written in it.
 *
 * The useful side effect: a Waterloo and a McMaster schedule in the same
 * autumn both land on `1269`, so the two show up in each other's shared-gap
 * queries without any cross-school term mapping.
 */
export function termCodeForDate(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const digit = month >= 9 ? 9 : month >= 5 ? 5 : 1;
  const century = Math.floor(year / 100) - 19;
  return `${century}${String(year % 100).padStart(2, "0")}${digit}`;
}

/**
 * The term a schedule pasted *today* is probably for.
 *
 * Only used when a paste carries no dates at all, which several portals
 * produce. Taking today's term straight would be wrong at the exact moment it
 * matters most: a student pasting on the 27th of August is holding a September
 * timetable, and Honk would file it under Spring and show them nobody.
 *
 * Two weeks of lookahead fixes every boundary at once — late August into Fall,
 * late December into Winter, late April into Spring — because in all three
 * cases the term you are about to be in is the one you are pasting.
 */
export function termCodeForPasteDate(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return termCodeForDate(iso);
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  date.setUTCDate(date.getUTCDate() + 14);
  return termCodeForDate(date.toISOString().slice(0, 10));
}

/** Derive the term from the earliest section start date in the paste. */
export function deriveTermCode(courses: ParsedCourse[]): string | null {
  const starts = courses
    .flatMap((c) => c.sections)
    .map((s) => s.startDate)
    .filter((d): d is string => Boolean(d))
    .sort();
  if (!starts.length) return null;
  return termCodeForDate(starts[0]);
}

/**
 * How much a parse actually got, for picking between two readings of the same
 * paste. Meetings dominate courses: a parser that found six courses and no
 * times has understood nothing useful, and one that found four courses with
 * every meeting in place has understood the schedule.
 */
export function parseScore(result: ParseResult): number {
  const meetings = result.courses.reduce(
    (n, c) => n + c.sections.reduce((m, s) => m + s.meetings.length, 0),
    0,
  );
  const sections = result.courses.reduce((n, c) => n + c.sections.length, 0);
  return meetings * 10 + sections * 3 + result.courses.length;
}
