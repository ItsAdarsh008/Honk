/** Campus-local time helpers. Waterloo is America/Toronto year-round. */

export const CAMPUS_TZ = "America/Toronto";

export const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function weekdayName(weekday: number): string {
  return WEEKDAY_NAMES[weekday - 1] ?? "";
}

export function weekdayShort(weekday: number): string {
  return WEEKDAY_SHORT[weekday - 1] ?? "";
}

export interface CampusNow {
  /** 1 = Monday ... 7 = Sunday */
  weekday: number;
  /** Minutes from midnight. */
  minute: number;
}

/** Current weekday and minute on campus, regardless of where the server runs. */
export function campusNow(date: Date = new Date()): CampusNow {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CAMPUS_TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const weekday = map[get("weekday")] ?? 1;
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return { weekday, minute: (Number.isNaN(hour) ? 0 : hour % 24) * 60 + (Number.isNaN(minute) ? 0 : minute) };
}

/** 630 -> "10:30 am". Times are metadata, so they render in mono. */
export function formatMinutes(total: number): string {
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h24 >= 12 ? "pm" : "am";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** 630, 680 -> "10:30 – 11:20 am" (one suffix when both sides share it). */
export function formatRange(start: number, end: number): string {
  const startPm = start >= 720;
  const endPm = end >= 720;
  if (startPm === endPm) {
    const h = (v: number) => {
      const h24 = Math.floor(v / 60);
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      return `${h12}:${String(v % 60).padStart(2, "0")}`;
    };
    return `${h(start)} – ${h(end)} ${endPm ? "pm" : "am"}`;
  }
  return `${formatMinutes(start)} – ${formatMinutes(end)}`;
}

/** 90 -> "1h 30m". Used for gap lengths. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** "1269" -> "Fall 2026". */
export function termName(code: string): string {
  const m = /^(\d)(\d{2})([159])$/.exec(code);
  if (!m) return code;
  const year = 1900 + Number(m[1]) * 100 + Number(m[2]);
  const season = m[3] === "9" ? "Fall" : m[3] === "5" ? "Spring" : "Winter";
  return `${season} ${year}`;
}
