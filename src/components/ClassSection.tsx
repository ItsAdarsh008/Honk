"use client";

/**
 * Your classes, each with the number of other people in that exact section.
 *
 * The count is the aggregate everyone is allowed to see; tapping fetches the
 * names of the people who have opted in, which is the moment a number becomes
 * faces. The two are deliberately different: `otherCount` can be larger than
 * the list, and the copy says so rather than pretending the class is empty.
 */

import { useCallback, useState } from "react";
import { assignCourseColors } from "@/lib/colors";
import type { ClassCount } from "@/lib/overlap/queries";
import { PersonRow, type Person } from "./PersonRow";

type LoadState = { status: "idle" } | { status: "loading" } | { status: "done"; people: Person[] };

export function ClassSection({ classes }: { classes: ClassCount[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const [loaded, setLoaded] = useState<Record<number, LoadState>>({});

  const toggle = useCallback(
    async (sectionId: number) => {
      if (open === sectionId) {
        setOpen(null);
        return;
      }
      setOpen(sectionId);
      if (loaded[sectionId]?.status === "done") return;

      setLoaded((prev) => ({ ...prev, [sectionId]: { status: "loading" } }));
      try {
        const response = await fetch(`/api/classmates?sectionId=${sectionId}`);
        const body = (await response.json().catch(() => ({}))) as { classmates?: Person[] };
        setLoaded((prev) => ({
          ...prev,
          [sectionId]: { status: "done", people: body.classmates ?? [] },
        }));
      } catch {
        setLoaded((prev) => ({ ...prev, [sectionId]: { status: "done", people: [] } }));
      }
    },
    [open, loaded],
  );

  // One row per course, with its sections grouped underneath.
  const byCourse = new Map<number, ClassCount[]>();
  for (const item of classes) {
    byCourse.set(item.courseId, [...(byCourse.get(item.courseId) ?? []), item]);
  }

  const colors = assignCourseColors(classes.map((c) => `${c.subject} ${c.catalog}`));

  return (
    <ul className="space-y-2">
      {[...byCourse.values()].map((sections) => {
        const first = sections[0];
        return (
          <li key={first.courseId} className="card overflow-hidden">
            <div className="flex items-start gap-3 p-4 pb-2">
              <span
                aria-hidden="true"
                className="mt-1.5 h-3 w-3 shrink-0 rounded-[4px]"
                style={{
                  background: `var(--course-${colors[`${first.subject} ${first.catalog}`]}-bg)`,
                }}
              />
              <div className="min-w-0">
                <span className="mono text-[14px] font-semibold">
                  {first.subject} {first.catalog}
                </span>
                {first.title && (
                  <span className="ml-2 text-[14px] text-[var(--ink-soft)]">{first.title}</span>
                )}
              </div>
            </div>

            <ul className="px-4 pb-3">
              {sections.map((section) => {
                const isOpen = open === section.sectionId;
                const load = loaded[section.sectionId];
                return (
                  <li key={section.sectionId} className="border-t border-[var(--border)] first:border-t-0">
                    <button
                      className="flex w-full items-center justify-between gap-3 py-3 text-left"
                      onClick={() => void toggle(section.sectionId)}
                      aria-expanded={isOpen}
                    >
                      <span className="chip">
                        {section.component} {section.sectionCode}
                      </span>
                      <span className="flex items-center gap-2 text-[14px] text-[var(--ink-soft)]">
                        {section.otherCount === 0
                          ? "nobody else yet"
                          : `${section.otherCount} ${section.otherCount === 1 ? "other" : "others"}`}
                        <span
                          aria-hidden="true"
                          className="mono text-[11px] text-[var(--ink-faint)]"
                        >
                          {isOpen ? "−" : "+"}
                        </span>
                      </span>
                    </button>

                    {isOpen && (
                      <div className="pb-3">
                        {load?.status === "loading" && (
                          <p className="text-[14px] text-[var(--ink-faint)]">Looking…</p>
                        )}
                        {load?.status === "done" && load.people.length === 0 && (
                          <p className="text-[14px] text-[var(--ink-soft)]">
                            {section.otherCount === 0
                              ? "Nobody else has pasted their schedule yet."
                              : `${section.otherCount} ${
                                  section.otherCount === 1 ? "person is" : "people are"
                                } in this section, but none of them are letting classmates see their name.`}
                          </p>
                        )}
                        {load?.status === "done" && load.people.length > 0 && (
                          <>
                            <ul className="divide-y divide-[var(--border)]">
                              {load.people.map((person) => (
                                <PersonRow key={person.id} person={person} />
                              ))}
                            </ul>
                            {section.otherCount > load.people.length && (
                              <p className="mt-2 text-[13px] text-[var(--ink-faint)]">
                                {section.otherCount - load.people.length} more{" "}
                                {section.otherCount - load.people.length === 1 ? "person is" : "people are"}{" "}
                                in this section but haven't turned on being seen.
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
