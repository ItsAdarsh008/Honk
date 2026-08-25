/**
 * Free/busy interval maths.
 *
 * Everything here is minutes from midnight on a single weekday. Pure, so the
 * same code can run on the server for a query and in the browser for a preview.
 */

export interface Interval {
  start: number;
  end: number;
}

/** Campus hours. A gap at 3am is not a gap anyone can use. */
export const DAY_START = 8 * 60;
export const DAY_END = 22 * 60;

/** Anything shorter than this is not enough time to do something together. */
export const MIN_GAP_MINUTES = 30;

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** A week of busy intervals, keyed by weekday (1 = Monday). */
export type WeekBusy = Record<number, Interval[]>;

export function emptyWeek(): WeekBusy {
  return { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
}

/** Sort and coalesce overlapping or touching intervals. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const valid = intervals
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Interval[] = [];
  for (const interval of valid) {
    const last = out[out.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      out.push({ start: interval.start, end: interval.end });
    }
  }
  return out;
}

/**
 * The complement of busy time within campus hours. Busy intervals are clamped
 * to the window first, so a class that runs past 22:00 does not create a
 * negative gap.
 */
export function freeIntervals(
  busy: Interval[],
  dayStart: number = DAY_START,
  dayEnd: number = DAY_END,
): Interval[] {
  const clamped = mergeIntervals(
    busy
      .map((i) => ({ start: Math.max(i.start, dayStart), end: Math.min(i.end, dayEnd) }))
      .filter((i) => i.end > i.start),
  );

  const out: Interval[] = [];
  let cursor = dayStart;
  for (const interval of clamped) {
    if (interval.start > cursor) out.push({ start: cursor, end: interval.start });
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < dayEnd) out.push({ start: cursor, end: dayEnd });
  return out;
}

/** Intersection of two interval sets. Both are merged first. */
export function intersectIntervals(a: Interval[], b: Interval[]): Interval[] {
  const left = mergeIntervals(a);
  const right = mergeIntervals(b);
  const out: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const start = Math.max(left[i].start, right[j].start);
    const end = Math.min(left[i].end, right[j].end);
    if (end > start) out.push({ start, end });
    if (left[i].end < right[j].end) i += 1;
    else j += 1;
  }
  return out;
}

export function durationOf(interval: Interval): number {
  return interval.end - interval.start;
}

export function atLeast(intervals: Interval[], minutes: number): Interval[] {
  return intervals.filter((i) => durationOf(i) >= minutes);
}

/**
 * Windows where every one of the given busy schedules is free. Used for two
 * people today, and it generalises to a group without changing shape.
 */
export function sharedGaps(
  schedules: Interval[][],
  options: { dayStart?: number; dayEnd?: number; minMinutes?: number } = {},
): Interval[] {
  const dayStart = options.dayStart ?? DAY_START;
  const dayEnd = options.dayEnd ?? DAY_END;
  const minMinutes = options.minMinutes ?? MIN_GAP_MINUTES;
  if (schedules.length === 0) return [];

  let acc = freeIntervals(schedules[0], dayStart, dayEnd);
  for (let i = 1; i < schedules.length; i += 1) {
    acc = intersectIntervals(acc, freeIntervals(schedules[i], dayStart, dayEnd));
    if (acc.length === 0) return [];
  }
  return atLeast(acc, minMinutes);
}

/** Shared gaps for a whole week, keyed by weekday. */
export function sharedGapsForWeek(
  weeks: WeekBusy[],
  options: { dayStart?: number; dayEnd?: number; minMinutes?: number } = {},
): WeekBusy {
  const out = emptyWeek();
  for (let weekday = 1; weekday <= 7; weekday += 1) {
    out[weekday] = sharedGaps(
      weeks.map((w) => w[weekday] ?? []),
      options,
    );
  }
  return out;
}

/** Is this person free at this minute of this weekday? */
export function isFreeAt(busy: Interval[], minute: number): boolean {
  if (minute < DAY_START || minute >= DAY_END) return false;
  return mergeIntervals(busy).every((i) => minute < i.start || minute >= i.end);
}

/** The interval containing `minute`, if any. */
export function intervalAt(intervals: Interval[], minute: number): Interval | null {
  return intervals.find((i) => minute >= i.start && minute < i.end) ?? null;
}

/**
 * The next shared gap at or after a point in the week, searching forward up to
 * seven days. Returns the weekday alongside the interval so callers can render
 * "Thursday 1:00–2:30".
 */
export function nextSharedGap(
  week: WeekBusy,
  fromWeekday: number,
  fromMinute: number,
): { weekday: number; interval: Interval } | null {
  for (let offset = 0; offset < 7; offset += 1) {
    const weekday = ((fromWeekday - 1 + offset) % 7) + 1;
    const candidates = (week[weekday] ?? []).slice().sort((a, b) => a.start - b.start);
    for (const interval of candidates) {
      if (offset > 0 || interval.end > fromMinute) {
        const start = offset === 0 ? Math.max(interval.start, fromMinute) : interval.start;
        if (interval.end - start >= MIN_GAP_MINUTES) {
          return { weekday, interval: { start, end: interval.end } };
        }
      }
    }
  }
  return null;
}
