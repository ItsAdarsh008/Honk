"use client";

/**
 * The weekly grid. This is the reveal screen — the moment a stranger decides
 * whether to trust the app, and the thing that gets screenshotted into a group
 * chat — so it is worth the care.
 *
 * Two decisions that shape it:
 *
 *  - The rendered window is derived from the actual classes, not a fixed
 *    08:00–22:00. A schedule that runs 8:30–16:00 should not render six empty
 *    evening hours.
 *  - Free time is drawn rather than left blank. Honk is about the gaps, so
 *    each one carries a hairline tick and its length in mono.
 */

import { useMemo } from "react";
import { freeIntervals, type Interval } from "@/lib/overlap/intervals";
import { formatDuration, formatRange, weekdayShort } from "@/lib/time";

export interface GridMeeting {
  weekday: number;
  startMin: number;
  endMin: number;
  location: string | null;
  /** "CS 135" */
  code: string;
  component: string;
  /** Stable per course, so the same class is the same colour everywhere. */
  colorIndex: number;
}

interface Props {
  meetings: GridMeeting[];
  /** 1–7, or null to highlight nothing. */
  today?: number | null;
  /** Draw the gap notation. Off for the tiny preview on the landing page. */
  showGaps?: boolean;
  /** Rooms are shown only where the viewer is entitled to see them. */
  showRooms?: boolean;
}

const HOUR = 60;

/** Deterministic, so a course keeps its colour between renders and devices. */
export function colorIndexFor(subject: string, catalog: string): number {
  const key = `${subject} ${catalog}`;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return (hash % 6) + 1;
}

export function ScheduleGrid({ meetings, today = null, showGaps = true, showRooms = true }: Props) {
  const model = useMemo(() => build(meetings), [meetings]);

  if (!model) {
    return (
      <div className="card p-8 text-center">
        <p className="text-[15px] text-[var(--ink-soft)]">
          No meeting times in this schedule yet.
        </p>
      </div>
    );
  }

  const { days, startMin, endMin, byDay, hours } = model;
  const span = endMin - startMin;
  const pct = (minute: number) => ((minute - startMin) / span) * 100;

  return (
    <div
      className="sched"
      style={
        {
          "--days": days.length,
          "--span": span,
        } as React.CSSProperties
      }
    >
      <div className="sched-head">
        <div />
        {days.map((day) => (
          <div key={day} className="sched-day-name" data-today={day === today}>
            {weekdayShort(day)}
          </div>
        ))}
      </div>

      <div className="sched-body">
        <div className="sched-gutter">
          {hours.map((hour) => (
            <span key={hour} className="sched-hour" style={{ top: `${pct(hour)}%` }}>
              {hourLabel(hour)}
            </span>
          ))}
        </div>

        {days.map((day) => {
          const dayMeetings = byDay.get(day) ?? [];
          const gaps = showGaps ? gapsFor(dayMeetings, startMin, endMin) : [];
          return (
            <div key={day} className="sched-col" data-today={day === today}>
              {hours.map((hour) => (
                <div key={hour} className="sched-rule" style={{ top: `${pct(hour)}%` }} />
              ))}

              {dayMeetings.length === 0 && <span className="sched-empty-day">free</span>}

              {gaps.map((gap) => (
                <div
                  key={`gap-${gap.start}`}
                  className="sched-gap"
                  style={{ top: `${pct(gap.start)}%`, height: `${(gap.end - gap.start) / span * 100}%` }}
                >
                  {gap.end - gap.start >= 55 && (
                    <span className="sched-gap-label">{formatDuration(gap.end - gap.start)}</span>
                  )}
                </div>
              ))}

              {dayMeetings.map((meeting) => {
                const height = ((meeting.endMin - meeting.startMin) / span) * 100;
                const tall = meeting.endMin - meeting.startMin >= 55;
                return (
                  <div
                    key={`${meeting.code}-${meeting.startMin}-${meeting.component}`}
                    className="sched-block"
                    style={
                      {
                        top: `${pct(meeting.startMin)}%`,
                        height: `${height}%`,
                        "--block-bg": `var(--course-${meeting.colorIndex}-bg)`,
                      } as React.CSSProperties
                    }
                    title={`${meeting.code} ${meeting.component} · ${formatRange(
                      meeting.startMin,
                      meeting.endMin,
                    )}${showRooms && meeting.location ? ` · ${meeting.location}` : ""}`}
                  >
                    <span className="sched-block-code">{meeting.code}</span>
                    {tall && (
                      <span className="sched-block-meta">
                        {showRooms && meeting.location ? meeting.location : meeting.component}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function hourLabel(minute: number): string {
  const h24 = Math.floor(minute / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}${h24 >= 12 ? "p" : "a"}`;
}

/**
 * Free windows worth naming. Anything under 40 minutes is not a gap you can do
 * something with, and drawing it would just add noise.
 */
function gapsFor(dayMeetings: GridMeeting[], startMin: number, endMin: number): Interval[] {
  if (!dayMeetings.length) return [];
  const busy = dayMeetings.map((m) => ({ start: m.startMin, end: m.endMin }));
  const first = Math.min(...busy.map((b) => b.start));
  const last = Math.max(...busy.map((b) => b.end));
  // Only the gaps *between* classes. The stretch before the first class and
  // after the last one is not a gap, it is the rest of the day.
  return freeIntervals(busy, Math.max(startMin, first), Math.min(endMin, last)).filter(
    (gap) => gap.end - gap.start >= 40,
  );
}

function build(meetings: GridMeeting[]) {
  if (!meetings.length) return null;

  // Mon–Fri always, so a light week still reads as a week. Weekend columns
  // appear only when something actually meets then.
  const present = new Set(meetings.map((m) => m.weekday));
  const days = [1, 2, 3, 4, 5];
  for (const day of [6, 7]) if (present.has(day)) days.push(day);

  const earliest = Math.min(...meetings.map((m) => m.startMin));
  const latest = Math.max(...meetings.map((m) => m.endMin));

  // Pad to the hour either side so blocks never touch the frame.
  const startMin = Math.max(0, Math.floor((earliest - 30) / HOUR) * HOUR);
  const endMin = Math.min(24 * HOUR, Math.ceil((latest + 30) / HOUR) * HOUR);

  const byDay = new Map<number, GridMeeting[]>();
  for (const meeting of meetings) {
    const list = byDay.get(meeting.weekday) ?? [];
    list.push(meeting);
    byDay.set(meeting.weekday, list);
  }
  for (const list of byDay.values()) list.sort((a, b) => a.startMin - b.startMin);

  const hours: number[] = [];
  for (let h = startMin; h <= endMin; h += HOUR) hours.push(h);

  return { days, startMin, endMin, byDay, hours };
}
