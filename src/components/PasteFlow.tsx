"use client";

/**
 * Paste → review.
 *
 * Parsing happens in the browser, so a paste that works never reaches the
 * server before the user has seen what was extracted and chosen to continue.
 * The review step appears the moment a paste parses — no "Continue" button
 * between pasting and the payoff.
 *
 * A paste that does *not* work is sent, once, to `/api/schedule/sample`. That
 * is the one exception to the sentence above and it is worth stating plainly:
 * at a beta school, a failed reading is the only evidence the bug ever existed,
 * and without it the student closes the tab and the bug leaves with them. See
 * `schedule/samples.ts` for what is kept and for how long.
 *
 * The school decides which instructions are printed and which parser is tried
 * first. It does not decide what can be pasted: both parsers run on every
 * paste and the better reading wins, so somebody who picked the wrong pill or
 * pasted from an unexpected page still gets their week.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseSchedule, type ScheduleParseResult } from "@/lib/schedule/parse";
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

/**
 * How long the text has to sit still before a failed reading is reported.
 *
 * Long enough that typing, or a paste arriving in more than one event, settles
 * into a single report rather than one per keystroke.
 */
const REPORT_DELAY_MS = 2000;

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
  /** Pastes already reported this session, so a re-render cannot resend one. */
  const reported = useRef<Set<string>>(new Set());
  const reportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // A pending report must not outlive the screen that scheduled it.
  useEffect(() => {
    return () => {
      if (reportTimer.current) clearTimeout(reportTimer.current);
    };
  }, []);

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

  /*
   * Reporting a reading that failed.
   *
   * Debounced, because this runs on every keystroke and a half-typed paste is
   * not a failure worth keeping — only the text somebody stopped on is. Each
   * distinct paste is sent at most once, so correcting a schedule and pasting
   * again does not write the same row twice.
   *
   * Fire and forget in both directions: nothing is awaited, and a rejection is
   * swallowed. The student is already looking at a paste that did not work and
   * an error about the error would help nobody.
   */
  const reportTrouble = useCallback(
    (value: string, parsed: ScheduleParseResult) => {
      if (!school.beta) return;
      if (parsed.courses.length > 0 && parsed.warnings.length === 0) return;

      const text = value.trim();
      if (text.length < 40 || reported.current.has(text)) return;
      reported.current.add(text);

      void fetch("/api/schedule/sample", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schoolId: school.id,
          parser: parsed.parser,
          rawText: value,
          courseCount: parsed.courses.length,
          warnings: parsed.warnings,
        }),
        keepalive: true,
      }).catch(() => {});
    },
    [school.beta, school.id],
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

      if (reportTimer.current) clearTimeout(reportTimer.current);
      reportTimer.current = setTimeout(() => reportTrouble(value, parsed), REPORT_DELAY_MS);
    },
    [parse, reportTrouble],
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
          The paste screen is where beta stops being a label and starts being a
          risk somebody is taking, so it is said here rather than only on the
          universities page — and said as what it actually is.
        */}
        {school.beta && (
          <p className="mt-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2.5 text-[13px] leading-relaxed text-[var(--ink-soft)]">
            <span className="chip mr-1.5 align-[1px]">beta</span>
            Honk has not read a real {school.short} schedule yet. Check the week it shows
            you before saving — if a class is missing or wrong,{" "}
            <a
              href="mailto:adarshthoduvakkal@gmail.com?subject=Honk%20read%20my%20schedule%20wrong"
              className="font-medium text-[var(--clay)] underline-offset-2 hover:underline"
            >
              send me the paste
            </a>{" "}
            and it gets fixed.
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
