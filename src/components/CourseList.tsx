/**
 * The courses under the grid: what Honk read, in plain rows.
 *
 * Course codes, rooms and times are machine-generated fields, so they set in
 * mono; titles and names are prose and set in the body face.
 */

import type { ParsedCourse } from "@/lib/quest/parse";
import { formatRange, weekdayShort } from "@/lib/time";
import { colorIndexFor } from "./ScheduleGrid";

export function CourseList({ courses }: { courses: ParsedCourse[] }) {
  return (
    <ul className="space-y-2">
      {courses.map((course) => (
        <li key={`${course.subject}-${course.catalog}`} className="card p-4">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-1 h-3 w-3 shrink-0 rounded-[4px]"
              style={{
                background: `var(--course-${colorIndexFor(course.subject, course.catalog)}-bg)`,
              }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span className="mono text-[14px] font-semibold">
                  {course.subject} {course.catalog}
                </span>
                {course.title && (
                  <span className="text-[14px] text-[var(--ink-soft)]">{course.title}</span>
                )}
              </div>

              <ul className="mt-2 space-y-1.5">
                {course.sections.map((section) => (
                  <li
                    key={section.classNumber}
                    className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[13px]"
                  >
                    <span className="chip">
                      {section.component} {section.sectionCode}
                    </span>
                    {section.meetings.length === 0 ? (
                      <span className="text-[var(--ink-faint)]">no set meeting time</span>
                    ) : (
                      <span className="mono text-[12px] text-[var(--ink-soft)]">
                        {summarise(section.meetings)}
                      </span>
                    )}
                    {section.meetings[0]?.location && (
                      <span className="mono text-[12px] text-[var(--ink-faint)]">
                        {section.meetings[0].location}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** "MWF 10:30 – 11:20 am", collapsing days that share a time. */
function summarise(meetings: ParsedCourse["sections"][number]["meetings"]): string {
  const byTime = new Map<string, number[]>();
  for (const meeting of meetings) {
    const key = `${meeting.startMin}-${meeting.endMin}`;
    byTime.set(key, [...(byTime.get(key) ?? []), meeting.weekday]);
  }
  return [...byTime.entries()]
    .map(([key, days]) => {
      const [start, end] = key.split("-").map(Number);
      const label = days
        .sort((a, b) => a - b)
        .map((d) => weekdayShort(d))
        .join(" ");
      return `${label}  ${formatRange(start, end)}`;
    })
    .join("   ·   ");
}
