import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminConfigured, isAdmin } from "@/lib/admin/auth";
import { getAdminStats, getLatestTerm } from "@/lib/admin/stats";
import {
  BLIND_SPOTS,
  capacitySignals,
  estimateBytes,
  formatBytes,
  type Level,
} from "@/lib/admin/capacity-signals";
import { AdminSignIn } from "@/components/admin/AdminSignIn";
import { BarChart, DayChart, StatTile } from "@/components/admin/Charts";
import { termName } from "@/lib/time";
import { LIVE_SCHOOLS } from "@/lib/schools";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Validated against the surface — see the dataviz palette check. */
const LEVEL_COLOR: Record<Level, string> = {
  good: "#3f7a34",
  watch: "#b5811f",
  act: "#a8442c",
};

const LEVEL_WORD: Record<Level, string> = {
  good: "Fine",
  watch: "Watch",
  act: "Act now",
};

/**
 * The operator's page.
 *
 * Two questions, in the order they get asked: *is anybody using this*, and *is
 * it about to cost me money*. Everything else is left out.
 *
 * It answers the second one honestly, which mostly means admitting what it
 * cannot see. The number that decides the first bill — Neon compute-hours —
 * is not visible from inside the app, so this page says so and links to the
 * console rather than inventing a gauge.
 */
export default async function AdminPage() {
  // Unconfigured, the page does not exist rather than refusing. A 404 tells a
  // stranger nothing; a login form tells them there is something here.
  if (!adminConfigured()) notFound();
  if (!(await isAdmin())) {
    return (
      <div className="py-8">
        <AdminSignIn />
      </div>
    );
  }

  const [stats, latestTerm] = await Promise.all([getAdminStats(), getLatestTerm()]);

  if (!stats) {
    return (
      <div className="card p-6">
        <h1 className="text-[20px] font-semibold">No database</h1>
        <p className="mt-2 text-[15px] text-[var(--ink-soft)]">
          <span className="mono">DATABASE_URL</span> is not set, so there is nothing to count.
        </p>
      </div>
    );
  }

  const recentSignups = stats.signups.slice(-7).reduce((n, d) => n + d.count, 0);
  const signals = capacitySignals({
    totalUsers: stats.totalUsers,
    withSchedule: stats.withSchedule,
    recentSignups,
    sectionRows: stats.sectionRows,
    meetingRows: stats.meetingRows,
    enrollmentRows: stats.enrollmentRows,
  });

  const withUsers = stats.schools.filter((s) => s.users > 0).length;
  const worst = signals.reduce<Level>(
    (acc, s) => (s.level === "act" ? "act" : s.level === "watch" && acc !== "act" ? "watch" : acc),
    "good",
  );

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Admin</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="chip"
            style={{ color: LEVEL_COLOR[worst], borderColor: LEVEL_COLOR[worst] }}
          >
            {LEVEL_WORD[worst]}
          </span>
          {latestTerm && <span className="chip">{termName(latestTerm)}</span>}
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Accounts"
          value={String(stats.totalUsers)}
          detail={`${stats.withSchedule} have pasted a schedule`}
        />
        <StatTile
          label="Signups, 7 days"
          value={String(recentSignups)}
          detail={recentSignups === 0 ? "quiet week" : "new verified accounts"}
        />
        <StatTile
          label="Schools with anybody"
          value={`${withUsers} / ${LIVE_SCHOOLS.length}`}
          detail="live universities"
        />
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="section-label">Accounts per university</h2>
          <p className="text-[13px] text-[var(--ink-faint)]">
            Solid is accounts that pasted a schedule; the pale bar is everyone who signed up. A
            zero means nobody has tried yet — not that anything is broken.
          </p>
        </div>
        <div className="card p-4 sm:p-5">
          <BarChart
            secondaryLabel="with a schedule"
            data={stats.schools.map((s) => ({
              label: s.name,
              value: s.users,
              secondary: s.withSchedule,
              note: s.beta ? "beta" : undefined,
            }))}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="section-label">Signups, last 30 days</h2>
        <div className="card p-4 sm:p-5">
          <DayChart data={stats.signups} />
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="section-label">Before it costs money</h2>
          <p className="text-[13px] text-[var(--ink-faint)]">
            Thresholds from <span className="mono">PAID.md</span>, not from round numbers.
          </p>
        </div>

        <ul className="space-y-2">
          {signals.map((signal) => (
            <li key={signal.id} className="card space-y-1.5 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[15px] font-semibold">{signal.title}</span>
                {/* Colour is never the only carrier: the word says it too. */}
                <span
                  className="mono text-[11px] uppercase tracking-[0.08em]"
                  style={{ color: LEVEL_COLOR[signal.level] }}
                >
                  {LEVEL_WORD[signal.level]}
                </span>
              </div>
              <p className="text-[14px] text-[var(--ink)]">{signal.reading}</p>
              <p className="text-[13px] leading-relaxed text-[var(--ink-soft)]">{signal.advice}</p>
              {signal.link && (
                <a
                  href={signal.link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-[13px] font-medium text-[var(--clay)] underline-offset-2 hover:underline"
                >
                  {signal.link.label} →
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="section-label">What this page cannot see</h2>
          <p className="text-[13px] leading-relaxed text-[var(--ink-faint)]">
            Listed rather than left as a gap. A dashboard that invented these numbers would be
            worse than one that admits it does not have them.
          </p>
        </div>
        <ul className="card divide-y divide-[var(--border)] px-4 py-1">
          {BLIND_SPOTS.map((spot) => (
            <li key={spot.what} className="py-3">
              <p className="text-[14px] font-medium">{spot.what}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--ink-soft)]">
                {spot.why}
              </p>
              <a
                href={spot.href}
                target="_blank"
                rel="noreferrer"
                className="mono mt-1 inline-block text-[12px] text-[var(--clay)] underline-offset-2 hover:underline"
              >
                {spot.where} →
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* The table view the charts owe their readers. */}
      <section className="space-y-3">
        <h2 className="section-label">The same numbers, as a table</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-[14px]">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="px-4 py-2.5 font-medium">University</th>
                <th className="px-4 py-2.5 text-right font-medium">Accounts</th>
                <th className="px-4 py-2.5 text-right font-medium">With a schedule</th>
                <th className="px-4 py-2.5 text-right font-medium">Failed pastes</th>
              </tr>
            </thead>
            <tbody>
              {stats.schools.map((s) => (
                <tr key={s.schoolId} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-2.5">
                    {s.name}
                    {s.beta && (
                      <span className="mono ml-1.5 text-[11px] text-[var(--ink-faint)]">beta</span>
                    )}
                  </td>
                  <td className="mono px-4 py-2.5 text-right tabular-nums">{s.users}</td>
                  <td className="mono px-4 py-2.5 text-right tabular-nums">{s.withSchedule}</td>
                  {/*
                    A count, never the text. Anything above zero is a parser bug
                    with the evidence already saved — `npm run samples -- <id>`.
                  */}
                  <td
                    className={`mono px-4 py-2.5 text-right tabular-nums ${
                      s.failedPastes > 0 ? "text-[var(--clay)]" : "text-[var(--ink-faint)]"
                    }`}
                  >
                    {s.failedPastes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mono text-[12px] text-[var(--ink-faint)]">
          {stats.sectionRows} sections · {stats.meetingRows} meetings · {stats.enrollmentRows}{" "}
          enrollments · ~{formatBytes(estimateBytes({
            totalUsers: stats.totalUsers,
            withSchedule: stats.withSchedule,
            recentSignups,
            sectionRows: stats.sectionRows,
            meetingRows: stats.meetingRows,
            enrollmentRows: stats.enrollmentRows,
          }))} of row data
        </p>
      </section>
    </div>
  );
}
