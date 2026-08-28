import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getOptionalUser } from "@/lib/auth/current";
import { getCurrentTermCode, getProfileByHandle, getSharedGapsWith } from "@/lib/overlap/queries";
import { campusNow, formatDuration, formatRange, weekdayName } from "@/lib/time";
import { ProfileActions } from "@/components/ProfileActions";
import { schoolOrDefault } from "@/lib/schools";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const user = await getOptionalUser();
  if (!user) redirect("/signin");

  const profile = await getProfileByHandle(user.id, handle);
  // A handle that is hidden, blocked or nonexistent is all the same 404 — the
  // page must not become a way to test whether someone has an account.
  if (!profile) notFound();

  const name = profile.displayName ?? "Someone";
  const termCode = await getCurrentTermCode(user.id);
  const week = termCode ? await getSharedGapsWith(user.id, profile.id, termCode) : null;
  const now = campusNow();

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">{name}</h1>
        <p className="mono text-[13px] text-[var(--ink-faint)]">
          @{profile.handle}
          {profile.schoolId !== user.schoolId && (
            <span className="ml-1.5 text-[var(--ink-soft)]">
              {schoolOrDefault(profile.schoolId).name}
            </span>
          )}
        </p>
        {profile.sharedSectionCount > 0 ? (
          <p className="text-[15px] text-[var(--ink-soft)]">
            You're in {profile.sharedSectionCount}{" "}
            {profile.sharedSectionCount === 1 ? "class" : "classes"} together.
          </p>
        ) : (
          profile.schoolId !== user.schoolId && (
            <p className="text-[15px] text-[var(--ink-soft)]">
              Different universities, so no shared classes — but free time still lines up.
            </p>
          )
        )}
      </header>

      <ProfileActions userId={profile.id} name={name} relationship={profile.relationship} />

      <section className="space-y-3">
        <h2 className="section-label">When you're both free</h2>
        {week === null ? (
          <p className="text-[15px] leading-relaxed text-[var(--ink-soft)]">
            {/*
              Two different reasons for the same null, and telling somebody to
              add a friend they have already added is the kind of small wrong
              thing that makes an app feel broken.
            */}
            {profile.relationship === "friends"
              ? "One of you hasn't got a schedule saved yet, so there is nothing to line up."
              : "Shared free time shows up once you've both added each other."}
          </p>
        ) : (
          <SharedWeek week={week} today={now.weekday} />
        )}
      </section>
    </div>
  );
}

function SharedWeek({
  week,
  today,
}: {
  week: Record<number, { start: number; end: number }[]>;
  today: number;
}) {
  const days = [1, 2, 3, 4, 5, 6, 7].filter((day) => (week[day] ?? []).length > 0);

  if (days.length === 0) {
    return (
      <p className="text-[15px] text-[var(--ink-soft)]">
        Your timetables don't leave you a free half-hour together this term.
      </p>
    );
  }

  return (
    <div className="card divide-y divide-[var(--border)]">
      {days.map((day) => (
        <div key={day} className="flex items-baseline gap-4 px-4 py-3">
          <span
            className="mono w-[74px] shrink-0 text-[12px]"
            style={{ color: day === today ? "var(--clay)" : "var(--ink-faint)" }}
          >
            {weekdayName(day)}
          </span>
          <ul className="min-w-0 flex-1 space-y-1">
            {week[day].map((gap) => (
              <li key={gap.start} className="flex flex-wrap items-baseline gap-x-2.5">
                <span className="mono text-[13px]">{formatRange(gap.start, gap.end)}</span>
                <span className="mono text-[12px] text-[var(--ink-faint)]">
                  {formatDuration(gap.end - gap.start)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
