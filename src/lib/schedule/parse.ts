/**
 * Choosing a parser.
 *
 * A school declares the format its portal produces, and that parser is tried
 * first. Then the other one is tried anyway, and whichever read more of the
 * paste wins.
 *
 * That second half is not hedging, it is the only honest position. Honk has
 * seen real pastes from Quest and nowhere else; every other school's format is
 * inferred from its portal's documentation, and a registrar can change a
 * layout over a summer without telling anybody. Running both parsers costs
 * microseconds on a few kilobytes of text, and it means a school whose portal
 * turns out to print a PeopleSoft-shaped table still works on day one, and a
 * Waterloo student who pastes from somewhere unexpected still gets a schedule.
 *
 * Pure, like both parsers. This runs in the browser: the raw paste does not
 * reach the server until the user has seen what was read and pressed save.
 */

import { parseQuestSchedule } from "../quest/parse";
import { parseGenericSchedule } from "./parsers/generic";
import { parseScore, termCodeForPasteDate, type ParseResult } from "./types";
import { DEFAULT_SCHOOL_ID, schoolOrDefault, type ParserId } from "../schools";

export interface ScheduleParseResult extends ParseResult {
  /** Which parser's reading this is. Shown in the diagnose script, not the UI. */
  parser: ParserId;
}

export interface ParseOptions {
  schoolId?: string | null;
  /**
   * Today, as ISO yyyy-mm-dd. Only used to name the term when a paste carries
   * no dates at all, which several portals do. Passed in rather than read from
   * the clock so both parsers stay pure and testable.
   */
  today?: string;
}

function run(parser: ParserId, input: string, today: string | undefined): ScheduleParseResult {
  if (parser === "peoplesoft") {
    const result = parseQuestSchedule(input);
    return {
      ...result,
      // The PeopleSoft layout always carries dates, but a truncated copy may
      // not, and a schedule with no term cannot be saved.
      termCode: result.termCode ?? (today ? termCodeForPasteDate(today) : null),
      parser: "peoplesoft",
    };
  }
  return { ...parseGenericSchedule(input, { today }), parser: "generic" };
}

export function parseSchedule(input: string, options: ParseOptions = {}): ScheduleParseResult {
  const school = schoolOrDefault(options.schoolId ?? DEFAULT_SCHOOL_ID);
  const preferred = run(school.parser, input, options.today);
  const other = run(school.parser === "peoplesoft" ? "generic" : "peoplesoft", input, options.today);

  // Ties go to the school's declared parser: it is the one whose warnings and
  // room handling were written for this portal.
  return parseScore(other) > parseScore(preferred) ? other : preferred;
}

export { parseScore } from "./types";
export type { ParseResult, ParsedCourse, ParsedSection, ParsedMeeting, ParseWarning } from "./types";
