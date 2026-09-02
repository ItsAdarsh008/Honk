import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getOptionalUser } from "@/lib/auth/current";
import { hasProfile } from "@/lib/auth/session";
import { friendIds, listIncomingRequests } from "@/lib/friends";
import {
  getCurrentTermCode,
  getFreeNow,
  getFriendsBySection,
  getFriendsWithNextGap,
  getMyClassesWithCounts,
  getMySchedule,
  getSharedSectionsWith,
  getStudyGroupNextGap,
} from "@/lib/overlap/queries";
import { listMyGroups } from "@/lib/study-groups";
import { sharedClassNote } from "@/lib/shared-class";
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
import {
  WeekWithPeople,
  type SectionSummary,
} from "@/components/WeekWithPeople";
import { ShareButton } from "@/components/ShareButton";
import { QrInvite } from "@/components/QrInvite";
import { PrivacyPrompt } from "@/components/PrivacyPrompt";
import { PasteFlow } from "@/components/PasteFlow";
import {
  FriendCountButton,
  PeopleList,
  PeopleReveal,
} from "@/components/PeopleReveal";
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
/**
 * Whose week this is.
 *
 * A possessive rather than a name stuck in front of a noun — "Adarsh week"
 * reads like a festival. The fallback keeps its own wording rather than
 * running through the same branch, because "Your's week" is the obvious way to
 * get this wrong.
 *
 * Always `'s`, including after an s: "Charles's week" is the Chicago form and
 * the one that survives being read aloud. The apostrophe is the typographic
 * one, to match every other contraction on the page.
 */
function weekTitle(displayName: string | null): string {
  const first = displayName?.trim().split(/\s+/)[0];
  return first ? `${first}\u2019s week` : "Your week";
}

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
            Paste it from {school.guide?.portal ?? "your portal"}, then Honk
            shows who else is in your classes and when you are free at the same
            time.
          </p>
        </div>
        <div className="card p-5 sm:p-6">
          <PasteFlow signedIn schoolId={user.schoolId} />
        </div>
      </div>
    );
  }

  const now = campusNow();
  const [
    classes,
    schedule,
    friends,
    requests,
    freeNow,
    friendsBySection,
    allFriendIds,
  ] = await Promise.all([
    getMyClassesWithCounts(user.id, termCode),
    getMySchedule(user.id, termCode),
    getFriendsWithNextGap(user.id, termCode, now),
    listIncomingRequests(user.id),
    getFreeNow(user.id, termCode, now),
    getFriendsBySection(user.id, termCode),
    friendIds(user.id),
  ]);

  /*
   * Everyone you have added, which is not what `friends` holds.
   *
   * `getFriendsWithNextGap` drops anybody with no schedule saved and anybody
   * with no gap in common, both of which are right for a list of *when to see
   * them* and wrong for a count of *how many there are*. Counting that list
   * told somebody with five friends who had not pasted yet that Honk needed
   * one other person to be worth anything.
   */
  const friendCount = allFriendIds.length;

  /*
   * Why each request happened, which is nearly always "we are in the same
   * lecture". A request with a reason attached is one somebody can judge; one
   * without is a name they will leave sitting there. Asked only about the
   * people already asking, and only about classes this viewer is in.
   */
  const sharedWithRequesters = await getSharedSectionsWith(
    user.id,
    requests.map((request) => request.profile.id),
    termCode,
  );

  const courseColors = assignCourseColors(
    schedule.map((c) => `${c.subject} ${c.catalog}`),
  );
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

  /*
   * The groups, and the next window each one shares.
   *
   * One query per group rather than one for all of them, which is fine at the
   * size this can be — a group is per section, and nobody is in twelve — and
   * `getStudyGroupNextGap` is where the membership check lives, so asking it
   * once per group is also asking it once per answer.
   */
  const myGroups = await listMyGroups(user.id);
  const groupGaps = new Map(
    await Promise.all(
      myGroups.map(
        async (group) =>
          [
            group.id,
            await getStudyGroupNextGap(user.id, group.id, termCode, now),
          ] as const,
      ),
    ),
  );
  const codeBySection = new Map(sections.map((s) => [s.sectionId, s.code]));

  const friendsInClasses = new Set(
    [...friendsBySection.values()].flatMap((list) => list.map((f) => f.id)),
  ).size;
  const nobodyYet = friendCount === 0 && requests.length === 0;

  return (
    <PeopleReveal count={friendCount}>
      <div className="space-y-10">
        {user.privacyPromptedAt === null && <PrivacyPrompt />}

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">
            {weekTitle(user.displayName)}
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
          <div className="flex shrink-0 items-center gap-2">
            <FriendCountButton />
            <QrInvite handle={user.handle} />
            <ShareButton handle={user.handle} label="Send my link" />
          </div>
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

        <section className="space-y-3" id="people">
          <h2 className="section-label">Your people</h2>

          {requests.length > 0 && (
            <div className="card px-4 py-1">
              <p className="border-b border-[var(--border)] pb-2 pt-3 text-[13px] text-[var(--ink-soft)]">
                {requests.length === 1
                  ? "One person wants"
                  : `${requests.length} people want`}{" "}
                to add you.
              </p>
              <ul className="divide-y divide-[var(--border)]">
                {requests.map((request) => (
                  <PersonRow
                    key={request.profile.id}
                    person={{
                      ...request.profile,
                      relationship: "request_received",
                    }}
                    viewerSchoolId={user.schoolId}
                    note={sharedClassNote(
                      sharedWithRequesters.get(request.profile.id) ?? [],
                    )}
                  />
                ))}
              </ul>
            </div>
          )}

          {friends.length > 0 ? (
            <PeopleList>
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
                          {formatRange(
                            friend.interval.start,
                            friend.interval.end,
                          )}
                          <span className="block text-[var(--ink-faint)]">
                            {formatDuration(
                              friend.interval.end - friend.interval.start,
                            )}{" "}
                            free
                          </span>
                        </span>
                      }
                    />
                  ))}
                </ul>
              </div>
            </PeopleList>
          ) : (
            requests.length === 0 && (
              <p className="text-[15px] leading-relaxed text-[var(--ink-soft)]">
                Nobody here yet. Open a class in the week below to see who else
                is in it, or send your link.
              </p>
            )
          )}
        </section>

        {myGroups.length > 0 && (
          <section className="space-y-3">
            <h2 className="section-label">Study groups</h2>
            <div className="card px-4 py-1">
              <ul className="divide-y divide-[var(--border)]">
                {myGroups.map((group) => {
                  const gap = groupGaps.get(group.id) ?? null;
                  return (
                    <li
                      key={group.id}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <span className="block truncate text-[15px] font-medium">
                          {group.name}
                        </span>
                        <span className="mono block truncate text-[12px] text-[var(--ink-faint)]">
                          {group.memberCount}{" "}
                          {group.memberCount === 1 ? "member" : "members"}
                          {codeBySection.get(group.sectionId) && (
                            <span className="ml-1.5">
                              {codeBySection.get(group.sectionId)}
                            </span>
                          )}
                        </span>
                      </div>
                      <span className="mono shrink-0 text-right text-[12px] text-[var(--ink-soft)]">
                        {gap ? (
                          <>
                            {weekdayShort(gap.weekday)}{" "}
                            {formatRange(gap.interval.start, gap.interval.end)}
                            <span className="block text-[var(--ink-faint)]">
                              {/*
                              Whose week this actually is. A group of six where
                              four have not pasted is not free on Thursday — a
                              group of two is, and saying "all free" over the
                              top of that is exactly the confident wrong answer
                              the rest of this app refuses to give.
                            */}
                              {gap.missing > 0
                                ? `${gap.counted} of ${group.memberCount} free`
                                : "all free"}
                            </span>
                          </>
                        ) : (
                          <span className="text-[var(--ink-faint)]">
                            no shared gap
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        )}

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
    </PeopleReveal>
  );
}
