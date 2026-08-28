/**
 * Why a real paste did not parse.
 *
 *   npx vite-node scripts/diagnose-paste.ts quest-samples/mine.txt [school]
 *
 * The parsers are deliberately quiet — they warn about lines that were plainly
 * trying to be data and ignore everything else, which is right for a user and
 * useless for debugging. This prints what the parser saw line by line: how each
 * line was split, which pattern claimed it, and which ones fell through. The
 * first block of `-` lines is almost always the answer.
 *
 * This is the tool for adding a school. Get one real paste, run it through
 * here, and the lines it could not read are the work.
 */

import { readFileSync } from "node:fs";
import { parseSchedule } from "../src/lib/schedule/parse";
import { LIVE_SCHOOLS, schoolOrDefault } from "../src/lib/schools";

const path = process.argv[2];
if (!path) {
  console.error("usage: vite-node scripts/diagnose-paste.ts <file> [school]");
  console.error(`schools: ${LIVE_SCHOOLS.map((s) => s.id).join(", ")}`);
  process.exit(2);
}

const school = schoolOrDefault(process.argv[3]);

const raw = readFileSync(path, "utf8");

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

const COURSE_HEADER_RE = /^([A-Za-z]{2,8})\s+(\d{1,3}[A-Za-z]{0,2})\s*[-–—]\s*(.+?)\s*$/;
const CLASS_NBR_RE = /^\d{4,5}$/;
const STATUS_RE = /^(Enrolled|Dropped|Waitlisted|Waiting|Wait\s?List(?:ed)?)\b/i;

function delimiter(line: string): string {
  if (line.includes("\t")) return "tab";
  if (/\S {2,}\S/.test(line)) return "2+ spaces";
  if (line.trim()) return "single-spaced";
  return "blank";
}

function classify(line: string): string {
  const t = line.replace(/ /g, " ").trim();
  if (!t) return "blank";
  if (COURSE_HEADER_RE.test(t)) return "COURSE HEADER";
  if (STATUS_RE.test(t)) return "status";
  if (/^\s*\d{4,5}\b/.test(t)) return "looks like a class row";
  const cells = t.includes("\t") ? t.split("\t") : /\S {2,}\S/.test(t) ? t.split(/ {2,}/) : [t];
  if (cells.some((c) => CLASS_NBR_RE.test(c.trim()))) return "has a class number";
  return "-";
}

const lines = raw.replace(/\r\n?/g, "\n").split("\n");

console.log(`\n${path}`);
console.log(`${lines.length} lines, ${raw.length} chars`);
console.log(`tabs: ${(raw.match(/\t/g) ?? []).length}   nbsp: ${(raw.match(/ /g) ?? []).length}\n`);

const width = String(lines.length).length;
for (const [i, line] of lines.entries()) {
  const kind = classify(line);
  if (kind === "blank") continue;
  const n = String(i + 1).padStart(width);
  const shown = line.length > 90 ? `${line.slice(0, 87)}...` : line;
  console.log(`${n}  ${kind.padEnd(21)} ${delimiter(line).padEnd(14)} ${JSON.stringify(shown)}`);
}

const result = parseSchedule(raw, { schoolId: school.id, today: new Date().toISOString().slice(0, 10) });
console.log(`\n-- result --------------------------------------------------`);
console.log(`school:   ${school.name} (${school.id})`);
console.log(
  `parser:   ${result.parser}${result.parser === school.parser ? "" : "  <- the other parser read more of it"}`,
);
console.log(`courses:  ${result.courses.length}`);
console.log(`termCode: ${result.termCode ?? "(none)"}`);
for (const c of result.courses) {
  console.log(`  ${c.subject} ${c.catalog} — ${c.title ?? "(no title)"}  [${c.status}]`);
  for (const s of c.sections) {
    const when = s.meetings
      .map(
        (m) =>
          `${DAY_NAMES[m.weekday - 1] ?? m.weekday} ${hhmm(m.startMin)}-${hhmm(m.endMin)}` +
          `${m.location ? ` @${m.location}` : " @TBA"}`,
      )

      .join(", ");
    console.log(
      `    ${s.classNumber ?? "—"} ${s.sectionCode} ${s.component}  ${when || "(no meetings)"}  ${s.startDate ?? "?"}..${s.endDate ?? "?"}`,
    );
  }
}
if (result.warnings.length) {
  console.log(`\nwarnings: ${result.warnings.length}`);
  for (const w of result.warnings) console.log(`  line ${w.line}: ${w.reason}\n    ${w.text}`);
}
if (!result.courses.length) {
  console.log(`\nNo courses. The parser needs a line matching "SUBJ 123 - Title" before any`);
  console.log(`class row will be attached to anything — check the COURSE HEADER rows above.`);
}
