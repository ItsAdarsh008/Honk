"use client";

/**
 * Paste → review.
 *
 * Parsing happens in the browser, so the raw paste never reaches the server
 * before the user has seen what was extracted and chosen to continue. The
 * review step appears the moment a paste parses — no "Continue" button between
 * pasting and the payoff.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseQuestSchedule, type ParseResult } from "@/lib/quest/parse";
import { savePending, clearPending } from "@/lib/pending";
import { termName } from "@/lib/time";
import { assignCourseColors } from "@/lib/colors";
import { ScheduleGrid, type GridMeeting } from "./ScheduleGrid";
import { CourseList } from "./CourseList";

interface Props {
  signedIn: boolean;
  /** Where to go once the schedule is saved. */
  onSaved?: () => void;
}

export function PasteFlow({ signedIn }: Props) {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState<ParseResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = useCallback((value: string) => {
    setRaw(value);
    setError(null);
    if (value.trim().length < 20) {
      setResult(null);
      return;
    }
    const parsed = parseQuestSchedule(value);
    setResult(parsed.courses.length ? parsed : null);
  }, []);

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
    <div className="rise">
      <label htmlFor="quest-paste" className="section-label">
        Paste from Quest
      </label>
      <textarea
        id="quest-paste"
        ref={areaRef}
        value={raw}
        onChange={(e) => handleChange(e.target.value)}
        spellCheck={false}
        rows={7}
        className="field mt-2 resize-y font-mono text-[13px] leading-relaxed"
        placeholder="CS 135 - Designing Functional Programs&#10;4280   001   LEC   MWF 10:30AM-11:20AM   MC 4020"
        aria-describedby="paste-help"
      />

      {looksLikeAttempt && (
        <p className="mt-3 text-[14px] text-[var(--ink-soft)]">
          Nothing readable in there yet. Make sure you copied the whole List View page,
          headings and all.
        </p>
      )}

      <div id="paste-help" className="mt-6">
        <p className="section-label">How to get it</p>
        <ol className="mt-3 space-y-2.5">
          {[
            "Open Quest and go to Enroll → My Class Schedule.",
            "Switch to List View.",
            "Select the whole page and copy it, then paste it above.",
          ].map((step, i) => (
            <li key={step} className="flex gap-3 text-[15px] text-[var(--ink-soft)]">
              <span className="mono mt-0.5 text-[11px] text-[var(--ink-faint)]">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
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
          Saving needs a <span className="mono">@uwaterloo.ca</span> address. It takes about
          twenty seconds.
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
