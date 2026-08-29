import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getOptionalUser } from "@/lib/auth/current";
import { hasProfile } from "@/lib/auth/session";
import { listIncomingRequests } from "@/lib/friends";
import {
  getCurrentTermCode,
  getFreeNow,
  getFriendsBySection,
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
import { PersonRow } from "@/components/PersonRow";
import { assignCourseColors } from "@/lib/colors";
import { type GridMeeting } from "@/components/ScheduleGrid";
import { WeekWithPeople, type SectionSummary } from "@/components/WeekWithPeople";
import { ShareButton } from "@/components/ShareButton";
import { PrivacyPrompt } from "@/components/PrivacyPrompt";
import { PasteFlow } from "@/components/PasteFlow";
import { schoolOrDefault } from "@/lib/schools";

export const metadata: Metadata = { title: "Your week" };
export const dynamic = "force-dynamic";

/**
 * Home.
 *
 * Ordered by what changes what somebody does next, which is not the order the
 * data comes in. The invite is first because Honk is worth nothing with one
 * person in it. The people are next. The week is last and carries the classes
 * inside it — there is no separate list of enrolments, because reading a
 * student their own timetable spends the screen on the one thing they already
 * knew when they opened the app.
 */
export default async function HomePage() {
  const user = await getOptionalUser();
  if (!user) redirect("/signin");
  if (!hasProfile(user)) redirect("/signin");

  const school = schoolOrDefault(user.schoolId);
  const termCode = await getCurrentTermCode(user.id);

  if (!termCode) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">
            Let&apos;s get your schedule in.
          </h1>
          <p className="text-[15px] text-[var(--ink-soft)]">
            Paste it from {school.guide?.portal ?? "your portal"}, then Honk shows who else
            is in your classes and when you are free at the same time.
          </p>
        </div>
        <div className="card p-5 sm:p-6">
          <PasteFlow signedIn schoolId={user.schoolId} />
        </div>
      </div>
    );
  }

  const now = campusNow();
  const [classes, schedule, friends, requests, freeNow, friendsBySection] = await Promise.all([
    getMyClassesWithCounts(user.id, termCode),
    getMySchedule(user.id, termCode),
    getFriendsWithNextGap(user.id, termCode, now),
    listIncomingRequests(user.id),
    getFreeNow(user.id, termCode, now),
    getFriendsBySection(user.id, termCode),
  ]);

  const courseColors = assignCourseColors(schedule.map((c) => `${c.subject} ${c.catalog}`));
  const countsBySection = new Map(classes.map((c) => [c.sectionId, c]));

  /*
   * The week, carrying who is in it. Counts and friends ride along on each
   * meeting rather than living in a list beside the grid, because the question
   * this page answers is not "what am I enrolled in" but "where in my week are
   * the people".
   */
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
        sectionId: section.sectionId,
        sharedCount: countsBySection.get(section.sectionId)?.otherCount ?? 0,
        friendCount: (friendsBySection.get(section.sectionId) ?? []).length,
      })),
    ),
  );

  const sections: SectionSummary[] = schedule.flatMap((course) =>
    course.sections.map((section) => ({
      sectionId: section.sectionId,
      code: `${course.subject} ${course.catalog}`,
      component: section.component,
      sectionCode: section.sectionCode,
      otherCount: countsBySection.get(section.sectionId)?.otherCount ?? 0,
      friends: friendsBySection.get(section.sectionId) ?? [],
    })),
  );

  const friendsInClasses = new Set(
    [...friendsBySection.values()].flatMap((list) => list.map((f) => f.id)),
  ).size;
  const nobodyYet = friends.length === 0 && requests.length === 0;

  return (
    <div className="space-y-10">
      {user.privacyPromptedAt === null && <PrivacyPrompt />}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">
          {user.displayName?.split(" ")[0] ?? "Your"} week
        </h1>
        <div className="flex flex-wrap gap-2">
          <span className="chip">{school.short}</span>
          <span className="chip">{termName(termCode)}</span>
        </div>
      </div>

      {/*
        The invite is the first thing now rather than a footnote under the
        classes. Honk is worth nothing with one person in it, so the single
        action that makes it worth anything does not belong below the fold —
        and it stays put once there are friends, because the second and the
        tenth are worth as much as the first.
      */}
      <section className="card flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">
            {nobodyYet
              ? "Honk needs one other person to be worth anything."
              : friendsInClasses > 0
                ? `You share classes with ${friendsInClasses} ${
                    friendsInClasses === 1 ? "friend" : "friends"
                  }.`
                : "Add the people you already sit next to."}
          </p>
          <p className="mt-0.5 text-[14px] leading-relaxed text-[var(--ink-soft)]">
            {nobodyYet
              ? "Send your link to the people you sit next to — and the ones who went somewhere else. Shared free time works across universities."
              : "Everyone you add makes the week below more useful."}
          </p>
        </div>
        <ShareButton handle={user.handle} label="Send my link" />
      </section>

      {/* Free right now leads only when there is something in it. */}
      {freeNow.length > 0 && (
        <section className="space-y-3">
          <h2 className="section-label">Free right now</h2>
          <div className="card px-4 py-1">
            <ul className="divide-y divide-[var(--border)]">
              {freeNow.map((entry) => (
                <PersonRow
                  key={entry.profile.id}
                  person={entry.profile}
                  viewerSchoolId={user.schoolId}
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
        <h2 className="section-label">Your people</h2>

        {requests.length > 0 && (
          <div className="card px-4 py-1">
            <p className="border-b border-[var(--border)] pb-2 pt-3 text-[13px] text-[var(--ink-soft)]">
              {requests.length === 1 ? "One person wants" : `${requests.length} people want`} to
              add you.
            </p>
            <ul className="divide-y divide-[var(--border)]">
              {requests.map((request) => (
                <PersonRow
                  key={request.profile.id}
                  person={{ ...request.profile, relationship: "request_received" }}
                  viewerSchoolId={user.schoolId}
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
                  viewerSchoolId={user.schoolId}
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
            <p className="text-[15px] leading-relaxed text-[var(--ink-soft)]">
              Nobody here yet. Open a class in the week below to see who else is in it, or send
              your link.
            </p>
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
        <WeekWithPeople
          meetings={meetings}
          sections={sections}
          today={now.weekday}
          viewerSchoolId={user.schoolId}
        />
      </section>
    </div>
  );
}
