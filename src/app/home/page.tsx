import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getOptionalUser } from "@/lib/auth/current";
import { hasProfile } from "@/lib/auth/session";
import { listIncomingRequests } from "@/lib/friends";
import {
  getCurrentTermCode,
  getFreeNow,
  getFriendsWithNextGap,
  getMyClassesWithCounts,
  getMySchedule,
} from "@/lib/overlap/queries";
import {
  campusNow,
  formatDuration,
  formatMinutes,
  formatRange,
  termName,
  weekdayShort,
} from "@/lib/time";
import { ClassSection } from "@/components/ClassSection";
import { PersonRow } from "@/components/PersonRow";
import { assignCourseColors } from "@/lib/colors";
import { ScheduleGrid, type GridMeeting } from "@/components/ScheduleGrid";
import { ShareButton } from "@/components/ShareButton";
import { PrivacyPrompt } from "@/components/PrivacyPrompt";
import { PasteFlow } from "@/components/PasteFlow";

export const metadata: Metadata = { title: "Your classes" };
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getOptionalUser();
  if (!user) redirect("/signin");
  if (!hasProfile(user)) redirect("/signin");

  const termCode = await getCurrentTermCode(user.id);

  if (!termCode) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">
            Let's get your schedule in.
          </h1>
          <p className="text-[15px] text-[var(--ink-soft)]">
            Paste it from Quest, then Honk shows who else is in your classes and when
            you are free at the same time.
          </p>
        </div>
        <div className="card p-5 sm:p-6">
          <PasteFlow signedIn />
        </div>
      </div>
    );
  }

  const now = campusNow();
  const [classes, schedule, friends, requests, freeNow] = await Promise.all([
    getMyClassesWithCounts(user.id, termCode),
    getMySchedule(user.id, termCode),
    getFriendsWithNextGap(user.id, termCode, now),
    listIncomingRequests(user.id),
    getFreeNow(user.id, termCode, now),
  ]);

  // Aggregate only, which SPEC section 6 allows to everyone: a count names
  // nobody. Summing across sections would double-count a person in two of
  // them, so this counts sections rather than people.
  const sectionsWithOthers = classes.filter((c) => c.otherCount > 0).length;
  const biggestShared = classes.reduce<(typeof classes)[number] | null>(
    (best, c) => (c.otherCount > (best?.otherCount ?? 0) ? c : best),
    null,
  );

  const courseColors = assignCourseColors(
    schedule.map((c) => `${c.subject} ${c.catalog}`),
  );

  const meetings: GridMeeting[] = schedule.flatMap((course) =>
    course.sections.flatMap((section) =>
      section.meetings.map((meeting) => ({
        weekday: meeting.weekday,
        startMin: meeting.startMin,
        endMin: meeting.endMin,
        location: meeting.location,
        code: `${course.subject} ${course.catalog}`,
        component: section.component,
        colorIndex: courseColors[`${course.subject} ${course.catalog}`],
      })),
    ),
  );

  return (
    <div className="space-y-10">
      {user.privacyPromptedAt === null && <PrivacyPrompt />}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">
          {user.displayName?.split(" ")[0] ?? "Your"} classes
        </h1>
        <span className="chip">{termName(termCode)}</span>
      </div>

      {/*
        The first thing somebody sees after pasting, and only while they have
        nobody. A schedule on its own is a timetable, which is not what Honk is
        — so the moment the paste lands, the screen says what the schedule is
        for and hands over the link. It disappears the instant there is one
        friend or one request, because past that point it would be nagging.
      */}
      {friends.length === 0 && requests.length === 0 && (
        <section className="card space-y-3 p-5 sm:p-6">
          <h2 className="text-[18px] font-semibold tracking-[-0.01em]">
            Honk needs one other person to be worth anything.
          </h2>
          <p className="text-[15px] leading-relaxed text-[var(--ink-soft)]">
            {sectionsWithOthers > 0 ? (
              <>
                You already share {sectionsWithOthers}{" "}
                {sectionsWithOthers === 1 ? "section" : "sections"} with people here
                {biggestShared ? (
                  <>
                    {" "}
                    — {biggestShared.otherCount} of them in{" "}
                    <span className="mono text-[14px]">
                      {biggestShared.subject} {biggestShared.catalog}
                    </span>
                  </>
                ) : null}
                . Shared classes show up on their own. Shared free time only appears once
                you have added each other.
              </>
            ) : (
              <>
                Nobody from your classes has joined yet, so there is nothing to see above.
                That is not broken — it is what being early looks like. Send your link to
                the people you already sit next to.
              </>
            )}
          </p>
          <div className="pt-1">
            <ShareButton handle={user.handle} label="Send my link" />
          </div>
        </section>
      )}

      {/* Free right now leads only when there is something in it. A brand-new
          account with no friends should not open onto an empty block. */}
      {freeNow.length > 0 && (
        <section className="space-y-3">
          <h2 className="section-label">Free right now</h2>
          <div className="card px-4 py-1">
            <ul className="divide-y divide-[var(--border)]">
              {freeNow.map((entry) => (
                <PersonRow
                  key={entry.profile.id}
                  person={entry.profile}
                  trailing={
                    <span className="mono shrink-0 text-[12px] text-[var(--ink-soft)]">
                      until {formatMinutes(entry.until)}
                    </span>
                  }
                />
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="section-label">Your classes</h2>
        <ClassSection classes={classes} />
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="section-label">Your people</h2>
          {friends.length > 0 && <ShareButton handle={user.handle} label="Invite" variant="secondary" />}
        </div>

        {requests.length > 0 && (
          <div className="card px-4 py-1">
            <p className="border-b border-[var(--border)] pb-2 pt-3 text-[13px] text-[var(--ink-soft)]">
              {requests.length === 1 ? "One person wants" : `${requests.length} people want`} to add
              you.
            </p>
            <ul className="divide-y divide-[var(--border)]">
              {requests.map((request) => (
                <PersonRow
                  key={request.profile.id}
                  person={{ ...request.profile, relationship: "request_received" }}
                />
              ))}
            </ul>
          </div>
        )}

        {friends.length > 0 ? (
          <div className="card px-4 py-1">
            <ul className="divide-y divide-[var(--border)]">
              {friends.map((friend) => (
                <PersonRow
                  key={friend.profile.id}
                  person={friend.profile}
                  trailing={
                    <span className="mono shrink-0 text-right text-[12px] text-[var(--ink-soft)]">
                      {weekdayShort(friend.weekday)}{" "}
                      {formatRange(friend.interval.start, friend.interval.end)}
                      <span className="block text-[var(--ink-faint)]">
                        {formatDuration(friend.interval.end - friend.interval.start)} free
                      </span>
                    </span>
                  }
                />
              ))}
            </ul>
          </div>
        ) : (
          requests.length === 0 && (
            <div className="card space-y-3 p-5">
              <p className="text-[15px] text-[var(--ink-soft)]">
                Nobody here yet. Add people from your classes above, or send your link to the
                friends you already have.
              </p>
              <ShareButton handle={user.handle} />
            </div>
          )
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="section-label">Your week</h2>
          <Link
            href="/paste"
            className="text-[13px] text-[var(--ink-soft)] underline-offset-2 hover:text-[var(--clay)] hover:underline"
          >
            Update it
          </Link>
        </div>
        <ScheduleGrid meetings={meetings} today={now.weekday} />
      </section>
    </div>
  );
}
