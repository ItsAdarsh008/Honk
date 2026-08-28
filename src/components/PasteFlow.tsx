"use client";

/**
 * Paste → review.
 *
 * Parsing happens in the browser, so the raw paste never reaches the server
 * before the user has seen what was extracted and chosen to continue. The
 * review step appears the moment a paste parses — no "Continue" button between
 * pasting and the payoff.
 *
 * The school decides which instructions are printed and which parser is tried
 * first. It does not decide what can be pasted: both parsers run on every
 * paste and the better reading wins, so somebody who picked the wrong pill or
 * pasted from an unexpected page still gets their week.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseSchedule } from "@/lib/schedule/parse";
import type { ParseResult } from "@/lib/schedule/types";
import { savePending, clearPending } from "@/lib/pending";
import { termName } from "@/lib/time";
import { isHandheld } from "@/lib/device";
import { assignCourseColors } from "@/lib/colors";
import { DEFAULT_SCHOOL_ID, schoolOrDefault } from "@/lib/schools";
import { readSchoolChoice, saveSchoolChoice } from "@/lib/school-choice";
import { ScheduleGrid, type GridMeeting } from "./ScheduleGrid";
import { CourseList } from "./CourseList";
import { SchoolPicker } from "./SchoolPicker";

interface Props {
  signedIn: boolean;
  /** The account's school. Null when signed out, and then the picker decides. */
  schoolId?: string | null;
}

export function PasteFlow({ signedIn, schoolId = null }: Props) {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState<ParseResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [handheld, setHandheld] = useState(false);
  const [chosen, setChosen] = useState<string>(schoolId ?? DEFAULT_SCHOOL_ID);

  const school = useMemo(() => schoolOrDefault(schoolId ?? chosen), [schoolId, chosen]);

  useEffect(() => {
    setHandheld(isHandheld(navigator.userAgent ?? "", navigator.maxTouchPoints ?? 0));
    // Only when signed out; an account's school is not the browser's to change.
    if (!schoolId) {
      const remembered = readSchoolChoice();
      if (remembered) setChosen(remembered);
    }
  }, [schoolId]);

  const pickSchool = useCallback((id: string) => {
    setChosen(id);
    saveSchoolChoice(id);
  }, []);

  const parse = useCallback(
    (value: string) =>
      parseSchedule(value, {
        schoolId: school.id,
        today: new Date().toISOString().slice(0, 10),
      }),
    [school.id],
  );

  const handleChange = useCallback(
    (value: string) => {
      setRaw(value);
      setError(null);
      if (value.trim().length < 20) {
        setResult(null);
        return;
      }
      const parsed = parse(value);
      setResult(parsed.courses.length ? parsed : null);
    },
    [parse],
  );

  const reset = useCallback(() => {
    setRaw("");
    setResult(null);
    setError(null);
    clearPending();
    requestAnimationFrame(() => areaRef.current?.focus());
  }, []);

  const save = useCallback(async () => {
    if (!result) return;
    const payload = { courses: result.courses, termCode: result.termCode };

    if (!signedIn) {
      savePending(payload);
      router.push("/signin");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "That didn't save. Try again.");
        setSaving(false);
        return;
      }
      clearPending();
      router.push("/home");
      router.refresh();
    } catch {
      setError("That didn't save. Check your connection and try again.");
      setSaving(false);
    }
  }, [result, signedIn, router]);

  if (result) {
    return (
      <ReviewStep
        result={result}
        saving={saving}
        error={error}
        signedIn={signedIn}
        onSave={save}
        onReset={reset}
      />
    );
  }

  const looksLikeAttempt = raw.trim().length >= 20;

  return (
    <div className="rise space-y-4">
      {/* Signed in, the school is settled and asking again could only get it wrong. */}
      {!signedIn && <SchoolPicker value={school.id} onChange={pickSchool} />}

      <div>
      <label htmlFor="quest-paste" className="section-label">
        Paste from {school.guide?.portal ?? "your portal"}
      </label>
      <textarea
        id="quest-paste"
        ref={areaRef}
        value={raw}
        onChange={(e) => handleChange(e.target.value)}
        spellCheck={false}
        rows={7}
        className="field mt-2 resize-y font-mono text-[13px] leading-relaxed"
        placeholder={
          school.parser === "peoplesoft"
            ? "CS 135 - Designing Functional Programs\n4280   001   LEC   MWF 10:30AM-11:20AM   MC 4020"
            : "ECON 1P92 D2 - Principles of Macroeconomics\nLEC  Mon, Wed  2:00 PM - 3:30 PM  TH 247"
        }
        aria-describedby="paste-help"
      />

      {looksLikeAttempt && (
        <p className="mt-3 text-[14px] text-[var(--ink-soft)]">
          Nothing readable in there yet. Make sure you copied the whole page, headings and
          all — and that the right school is picked above.
        </p>
      )}

      <div id="paste-help" className="mt-6">
        <p className="section-label">How to get it</p>
        <ol className="mt-3 space-y-2.5">
          {(school.guide?.steps ?? []).map((step, i) => (
            <li key={step} className="flex gap-3 text-[15px] text-[var(--ink-soft)]">
              <span className="mono mt-0.5 text-[11px] text-[var(--ink-faint)]">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        {school.guide?.note && (
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--ink-faint)]">
            {school.guide.note}
          </p>
        )}
        {/*
          Rendered after mount, never during: the server cannot know what this
          is, and defaulting to false means a laptop never flashes a line
          telling it to go find a laptop.
        */}
        {handheld && (
          <p className="mt-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2.5 text-[13px] leading-relaxed text-[var(--ink-soft)]">
            <strong className="font-semibold text-[var(--ink)]">This part needs a laptop.</strong>{" "}
            {school.guide?.portal ?? "Your portal"} has no class schedule page on mobile, so
            there is nothing to copy from a phone. Once your schedule is in, Honk works fine
            here.
          </p>
        )}
      </div>
      </div>
    </div>
  );
}

function ReviewStep({
  result,
  saving,
  error,
  signedIn,
  onSave,
  onReset,
}: {
  result: ParseResult;
  saving: boolean;
  error: string | null;
  signedIn: boolean;
  onSave: () => void;
  onReset: () => void;
}) {
  const meetings = useMemo<GridMeeting[]>(() => {
    const colors = assignCourseColors(
      result.courses.map((c) => `${c.subject} ${c.catalog}`),
    );
    return (
      result.courses.flatMap((course) =>
        course.sections.flatMap((section) =>
          section.meetings.map((meeting) => ({
            weekday: meeting.weekday,
            startMin: meeting.startMin,
            endMin: meeting.endMin,
            location: meeting.location,
            code: `${course.subject} ${course.catalog}`,
            component: section.component,
            colorIndex: colors[`${course.subject} ${course.catalog}`],
          })),
        ),
      )
    );
  }, [result]);

  const sectionCount = result.courses.reduce((n, c) => n + c.sections.length, 0);

  return (
    <div className="rise space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-semibold tracking-[-0.01em]">That&rsquo;s your week.</h2>
          {/*
            Deliberately not "check it looks right". Quest and every timetable
            tool already draw a grid; if this screen reads as another one, Honk
            gets filed next to them. The grid is here to prove the paste worked
            — the sentence is here to say what it is actually for.
          */}
          <p className="mt-1 text-[15px] text-[var(--ink-soft)]">
            Now the part a timetable can&rsquo;t do: who else is in these classes, and when
            you and your friends are both free.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {result.termCode && <span className="chip chip-accent">{termName(result.termCode)}</span>}
          <span className="chip">
            {result.courses.length} {result.courses.length === 1 ? "course" : "courses"}
          </span>
          <span className="chip">{sectionCount} sections</span>
        </div>
      </div>

      <ScheduleGrid meetings={meetings} />

      <CourseList courses={result.courses} />

      {result.warnings.length > 0 && <Warnings warnings={result.warnings} />}

      {error && (
        <p className="text-[15px] text-[#a8442c] dark:text-[#e08b6f]" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : signedIn ? "Save and find my classes" : "Save it and find your classes"}
        </button>
        <button className="btn btn-quiet" onClick={onReset} disabled={saving}>
          Paste a different one
        </button>
      </div>

      {!signedIn && (
        <p className="text-[14px] text-[var(--ink-soft)]">
          Saving needs a school address and a passkey — Face ID or your screen lock. About
          twenty seconds, with nothing to wait for.
        </p>
      )}
    </div>
  );
}

function Warnings({ warnings }: { warnings: ParseResult["warnings"] }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-sunken)] p-4">
      <p className="section-label">Lines Honk skipped</p>
      <ul className="mt-3 space-y-2">
        {warnings.map((warning, i) => (
          <li key={`${warning.line}-${i}`} className="text-[14px] text-[var(--ink-soft)]">
            <span className="mono text-[12px] text-[var(--ink-faint)]">
              {warning.line > 0 ? `line ${warning.line}` : "course"}
            </span>{" "}
            — {warning.reason}
            {warning.text && (
              <span className="mono ml-1 text-[12px] text-[var(--ink-faint)]">
                “{warning.text.slice(0, 60)}”
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[13px] text-[var(--ink-faint)]">
        Everything else was read fine. If a class is missing from the grid, that's why.
      </p>
    </div>
  );
}
