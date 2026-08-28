/**
 * When to think about paying for something.
 *
 * Every threshold here traces to the arithmetic in `PAID.md` rather than to a
 * round number that felt about right. Pure, so the bands can be tested without
 * a database.
 *
 * **The honest part first.** The constraint that actually decides the first
 * bill — Neon compute-hours — *cannot be measured from inside this app*. Neon
 * bills for time the database is awake, not for queries, and nothing in
 * Postgres reports that back. Nor can Vercel bandwidth or function
 * invocations. So this page does not pretend: it shows what the database can
 * answer, converts it into the signal PAID.md says to watch, and points at the
 * console for the number only the console has.
 *
 * A dashboard that invented a compute-hours figure would be worse than one
 * that admits it cannot see it.
 */

export type Level = "good" | "watch" | "act";

export interface Signal {
  id: string;
  title: string;
  level: Level;
  /** What is true right now. */
  reading: string;
  /** What to do about it, or why nothing needs doing. */
  advice: string;
  /** Where the real number lives, when this app cannot see it. */
  link?: { label: string; href: string };
}

export interface SignalInput {
  totalUsers: number;
  withSchedule: number;
  /** Signups in the last seven days. */
  recentSignups: number;
  sectionRows: number;
  meetingRows: number;
  enrollmentRows: number;
}

/** Rough per-row costs, deliberately generous. See PAID.md. */
const BYTES = { user: 220, section: 160, meeting: 90, enrollment: 60 };
const NEON_FREE_STORAGE = 0.5 * 1024 * 1024 * 1024;

export function estimateBytes(input: SignalInput): number {
  return (
    input.totalUsers * BYTES.user +
    input.sectionRows * BYTES.section +
    input.meetingRows * BYTES.meeting +
    input.enrollmentRows * BYTES.enrollment
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function capacitySignals(input: SignalInput): Signal[] {
  const signals: Signal[] = [];

  /*
   * 1. Neon compute hours — the first wall, and an invisible one.
   *
   * PAID.md: the free plan is ~190 compute-hours a month, and the endpoint is
   * awake whenever a query arrives within its five-minute idle window. That
   * works out to about 6.3 hours of wakefulness a day. Usage spread across a
   * teaching day exceeds it long before storage or bandwidth matter.
   *
   * User count is a proxy for spread, not a measurement of it.
   */
  const neonLevel: Level =
    input.totalUsers >= 300 ? "act" : input.totalUsers >= 50 ? "watch" : "good";
  signals.push({
    id: "neon-compute",
    title: "Neon compute hours",
    level: neonLevel,
    reading:
      neonLevel === "good"
        ? `${input.totalUsers} accounts — well inside a day that lets the database sleep.`
        : neonLevel === "watch"
          ? `${input.totalUsers} accounts is enough usage to keep the database awake most of the day.`
          : `${input.totalUsers} accounts almost certainly keeps the database awake all day.`,
    advice:
      neonLevel === "good"
        ? "Nothing to do. Check the graph around the 10th of the month anyway — it is the number that runs out first."
        : neonLevel === "watch"
          ? "Look at the compute graph around the 10th. Past a third used by then, the month will not make it. Neon Launch is about $19/mo."
          : "Assume the free 190 hours will not last the month. Neon Launch, about $19/mo, is the fix.",
    link: { label: "Neon console", href: "https://console.neon.tech" },
  });

  /*
   * 2. Storage — the one thing this page can measure honestly, and the one
   * least likely to matter. Sections are shared between students, so three
   * hundred people in a lecture write one meetings row between them.
   */
  const bytes = estimateBytes(input);
  const share = bytes / NEON_FREE_STORAGE;
  signals.push({
    id: "storage",
    title: "Database size",
    level: share > 0.8 ? "act" : share > 0.5 ? "watch" : "good",
    reading: `About ${formatBytes(bytes)} of row data — roughly ${(share * 100).toFixed(1)}% of the free 0.5 GB.`,
    advice:
      share > 0.5
        ? "Storage is finally the binding constraint. Neon Launch raises it to 10 GB."
        : "Not the thing that will cost you money. Rows here are tiny and sections are shared between students.",
  });

  /*
   * 3. Growth — the leading indicator. A week that adds more accounts than
   * exist changes which band you are in before the next look.
   */
  const growth = input.totalUsers > 0 ? input.recentSignups / input.totalUsers : 0;
  const growthLevel: Level =
    input.recentSignups >= 200 ? "act" : input.recentSignups >= 50 || growth > 0.5 ? "watch" : "good";
  signals.push({
    id: "growth",
    title: "Signups this week",
    level: growthLevel,
    reading:
      input.recentSignups === 0
        ? "Nobody new in the last seven days."
        : `${input.recentSignups} in the last seven days${
            growth > 0 ? ` — ${(growth * 100).toFixed(0)}% of all accounts` : ""
          }.`,
    advice:
      growthLevel === "good"
        ? "Steady. The bands above are the ones to watch."
        : "Growing fast enough that the compute-hours band will move before you next look. Check the Neon graph now rather than at month end.",
  });

  /*
   * 4. The classmate query, which gets slower as Honk gets more popular.
   * PAID.md called this the first thing to fix; it is fixed, and this is here
   * so a regression shows up as a number rather than as a slow page.
   */
  const busiest = input.withSchedule;
  signals.push({
    id: "rosters",
    title: "Schedules pasted",
    level: "good",
    reading: `${busiest} of ${input.totalUsers} accounts have pasted a schedule.`,
    advice:
      busiest < input.totalUsers / 2 && input.totalUsers >= 10
        ? "Under half. Accounts without a schedule see nothing and tend not to come back — worth knowing why they stopped."
        : "Rosters resolve in one query regardless of class size, so a big lecture costs the same as a tutorial.",
  });

  return signals;
}

/**
 * Things this app cannot see, said out loud rather than left as a gap.
 * Everything here needs a console, and pretending otherwise would be the
 * dashboard's worst failure mode.
 */
export const BLIND_SPOTS: Array<{ what: string; why: string; where: string; href: string }> = [
  {
    what: "Compute hours used this month",
    why: "Neon bills for time the database is awake. Postgres does not report that to itself.",
    where: "Neon console → Monitoring",
    href: "https://console.neon.tech",
  },
  {
    what: "Bandwidth and function invocations",
    why: "Vercel counts these at the edge, before any code here runs.",
    where: "Vercel → Usage",
    href: "https://vercel.com/dashboard",
  },
  {
    what: "Daily active users",
    why: "Honk stores no last-seen timestamp, on purpose — it is one field away from a surveillance feature.",
    where: "Vercel Web Analytics, page views only",
    href: "https://vercel.com/dashboard",
  },
];
