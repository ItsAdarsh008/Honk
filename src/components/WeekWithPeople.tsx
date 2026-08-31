"use client";

/**
 * The week, and who is in it.
 *
 * This replaced a list of every class with a count beside it. The list was
 * honest and useless: a student already knows what they are enrolled in, so
 * reading their own timetable back to them spends the whole screen restating
 * the one thing they came in already knowing.
 *
 * The calendar earns the space instead, because it answers a question the list
 * could not — *where in my week are the people?* A block with a dot is a room
 * with a friend in it, which is the only fact on this page that changes what
 * somebody does next.
 *
 * Tapping a block still opens the roster, so nothing that was reachable before
 * became unreachable. It just stopped being the first thing on the screen.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Classmate } from "@/lib/overlap/queries";
import { ScheduleGrid, type GridMeeting } from "./ScheduleGrid";
import { PersonRow, type Person } from "./PersonRow";
import { StudyGroupPanel } from "./StudyGroupPanel";

type LoadState = { status: "loading" } | { status: "done"; people: Person[] };

/**
 * Where the nudge remembers it has been used.
 *
 * Per browser, not per account, and that is the right trade for something this
 * small: no column, no migration, no write on a page that should only read. A
 * new browser showing it once more costs a glance; a schema change costs a
 * deploy, and the one thing this feature must not do is become work.
 */
const HINT_SEEN_KEY = "honk:hint:tap-a-class";

export interface SectionSummary {
  sectionId: number;
  code: string;
  component: string;
  sectionCode: string;
  /** Everyone else in this exact section, opted in or not. */
  otherCount: number;
  /** Accepted friends in it, resolved on the server. */
  friends: Classmate[];
}

export function WeekWithPeople({
  meetings,
  sections,
  today,
  viewerSchoolId,
}: {
  meetings: GridMeeting[];
  sections: SectionSummary[];
  today: number;
  viewerSchoolId: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [loaded, setLoaded] = useState<Record<number, LoadState>>({});

  /*
   * Starts hidden and is turned on by the effect below, never by the server.
   * The value lives in localStorage, which does not exist during the render
   * that has to match the server's, so assuming "seen" is the only starting
   * point that cannot flash the nudge at somebody who dismissed it weeks ago.
   */
  const [hintSeen, setHintSeen] = useState(true);

  useEffect(() => {
    try {
      setHintSeen(window.localStorage.getItem(HINT_SEEN_KEY) === "1");
    } catch {
      // A browser that refuses storage gets the nudge every time, which is a
      // far better failure than a silent one that never shows it at all.
      setHintSeen(false);
    }
  }, []);

  const markHintSeen = useCallback(() => {
    setHintSeen(true);
    try {
      window.localStorage.setItem(HINT_SEEN_KEY, "1");
    } catch {
      // Nothing to do, and nothing worth telling anybody about.
    }
  }, []);

  /*
   * The class worth pointing at: the one with the most people behind it. A
   * friend outranks any number of strangers, because opening that block is the
   * one that pays off immediately.
   *
   * Nothing is pointed at when no section has anybody in it. Teaching the
   * interaction with an empty room teaches the wrong thing — the answer would
   * be "nobody here yet", which is the one first impression worth avoiding.
   */
  const hintSection = useMemo(() => {
    const candidates = sections.filter((s) => s.friends.length > 0 || s.otherCount > 0);
    if (!candidates.length) return null;
    return [...candidates].sort(
      (a, b) => b.friends.length - a.friends.length || b.otherCount - a.otherCount,
    )[0];
  }, [sections]);

  const showHint = !hintSeen && hintSection !== null && open === null;

  const select = useCallback(
    async (sectionId: number) => {
      // Whatever they tapped, they have found the interaction. Never again.
      markHintSeen();
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
    [open, loaded, markHintSeen],
  );

  const selected = sections.find((s) => s.sectionId === open) ?? null;
  const load = open === null ? undefined : loaded[open];

  return (
    <div className="space-y-3">
      {/*
        Above the grid rather than below it. The grid is taller than a phone,
        so anything under it is a scroll away from the thing it is talking
        about — and this has one job, which is to be read before the grid is.
      */}
      {showHint && hintSection && (
        <div className="hint rise" role="note">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold">
              {hintSection.friends.length > 0
                ? `${
                    hintSection.friends.length === 1
                      ? "A friend is"
                      : `${hintSection.friends.length} friends are`
                  } in your ${hintSection.code}.`
                : `${hintSection.otherCount} ${
                    hintSection.otherCount === 1 ? "person is" : "people are"
                  } in your ${hintSection.code}.`}
            </p>
            <p className="text-[13px] text-[var(--ink-soft)]">
              Tap that class below to see who — and add them.
            </p>
          </div>
          <button
            className="btn btn-quiet shrink-0 px-3 py-2 text-[13px]"
            onClick={markHintSeen}
          >
            Got it
          </button>
        </div>
      )}

      <ScheduleGrid
        meetings={meetings}
        today={today}
        onSelectSection={(id) => void select(id)}
        selectedSectionId={open}
        hintSectionId={showHint ? (hintSection?.sectionId ?? null) : null}
      />

      {selected === null ? (
        // Suppressed while the nudge is up: two lines saying the same thing in
        // different words reads as an app that is not sure you heard it.
        showHint ? null : (
          <p className="text-[13px] text-[var(--ink-faint)]">
            Tap a class to see who else is in it.
          </p>
        )
      ) : (
        <div className="card space-y-3 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <span className="mono text-[14px] font-semibold">{selected.code}</span>
              <span className="chip">
                {selected.component} {selected.sectionCode}
              </span>
            </div>
            <button
              className="text-[13px] text-[var(--ink-soft)] underline-offset-2 hover:underline"
              onClick={() => setOpen(null)}
            >
              Close
            </button>
          </div>

          {/*
            Friends first and always, because they are already known to be
            visible to this person — no fetch, no discoverability check, and
            the only names on the page worth reading first.
          */}
          {selected.friends.length > 0 && (
            <div className="space-y-1">
              <p className="section-label">In here with you</p>
              <ul className="divide-y divide-[var(--border)]">
                {selected.friends.map((friend) => (
                  <PersonRow
                    key={friend.id}
                    person={friend}
                    viewerSchoolId={viewerSchoolId}
                    trailing={<span className="chip shrink-0">friend</span>}
                  />
                ))}
              </ul>
            </div>
          )}

          {load?.status === "loading" && (
            <p className="text-[14px] text-[var(--ink-faint)]">Looking…</p>
          )}

          {load?.status === "done" && <Roster selected={selected} people={load.people} viewerSchoolId={viewerSchoolId} />}

          {/*
            Under the roster, not above it. The names are why the panel was
            opened; a study group is what somebody does about them once they
            have read the names.
          */}
          <StudyGroupPanel sectionId={selected.sectionId} code={selected.code} />
        </div>
      )}
    </div>
  );
}

/**
 * Everyone in the section who is not already a friend.
 *
 * `otherCount` counts everybody; the list only holds those who opted in to
 * being seen. The copy says which is which rather than implying an empty room,
 * because "nobody else is in your lecture" is both false and discouraging in a
 * way that makes people stop opening the app.
 */
function Roster({
  selected,
  people,
  viewerSchoolId,
}: {
  selected: SectionSummary;
  people: Person[];
  viewerSchoolId: string;
}) {
  const friendIds = new Set(selected.friends.map((f) => f.id));
  const strangers = people.filter((p) => !friendIds.has(p.id));
  const hidden = selected.otherCount - people.length;

  if (selected.otherCount === 0) {
    return (
      <p className="text-[14px] text-[var(--ink-soft)]">
        Nobody else here has pasted their schedule yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {strangers.length > 0 && (
        <>
          <p className="section-label">Also in this section</p>
          <ul className="divide-y divide-[var(--border)]">
            {strangers.map((person) => (
              <PersonRow key={person.id} person={person} viewerSchoolId={viewerSchoolId} />
            ))}
          </ul>
        </>
      )}

      {strangers.length === 0 && selected.friends.length === 0 && (
        <p className="text-[14px] text-[var(--ink-soft)]">
          {selected.otherCount} {selected.otherCount === 1 ? "person is" : "people are"} in this
          section, and none of them are letting classmates see their name yet.
        </p>
      )}

      {hidden > 0 && strangers.length > 0 && (
        <p className="text-[13px] text-[var(--ink-faint)]">
          {hidden} more {hidden === 1 ? "person is" : "people are"} in here but haven&rsquo;t
          turned on being seen.
        </p>
      )}
    </div>
  );
}
