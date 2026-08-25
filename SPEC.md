# Honk — spec

A Waterloo-only web app: paste your Quest schedule, instantly see who you share classes
and free time with. Built to be launched during frosh week, when "what classes are you
in?" is the single most-asked question on campus.

**Name: Honk**, after Waterloo's campus geese. The name is the joke; the interface is
calm. It gets an instant laugh from exactly the audience we want, but the app itself is
a quiet pastel tool — one small goose mark and no more. See `HONK_BUILD_PROMPT.md` for
the palette and voice.

---

## 1. Why this shape

The viral mechanic is not sharing — it's *incompleteness*. The app is worth little with
one user and much more with every friend added, so the invite is self-motivated rather
than nagged. The cold-start problem is solved by timing: launch into the two weeks when
8,000 first-years are actively trying to find each other.

Two consequences for scope:

- The paste must be one step. Every extra step compounds against the loop.
- The payoff must be visible *before* signup completes. Parse first, register second.

## 2. MVP scope (locked)

In:

- Paste Quest schedule → parsed courses, sections, meeting times
- `@uwaterloo.ca` email verification
- Shared classes: exact section (same lecture) and same-course-different-section
- Shared gaps: overlapping free windows between classes
- "Free right now" view
- Friend graph: request → accept, mutual-only for sensitive views
- Privacy controls

Out (post-launch):

- Feed, DMs, clubs
- Course reviews (UWFlow owns this; do not compete)
- Schedule building / course planning (UWPilot, UWScheduler own this)
- Non-Waterloo campuses

## 3. Data model

```
users            id, email, handle, display_name, avatar_url, program, term_level,
                 discoverable (bool), verified_at, created_at

terms            code (e.g. 1269), name, start_date, end_date

courses          id, subject, catalog, title            -- CS 135, "Designing Functional Programs"
                 unique (subject, catalog)

sections         id, course_id, term_code, class_number, section_code, component,
                 instructor, start_date, end_date
                 unique (term_code, class_number)

meetings         id, section_id, weekday (1=Mon..7=Sun), start_min, end_min, location

enrollments      user_id, section_id, term_code, created_at
                 unique (user_id, section_id)

friendships      requester_id, addressee_id, status(pending|accepted|blocked), created_at
                 unique (least(a,b), greatest(a,b))
```

`enrollments` joined to itself on `section_id` is the entire shared-class feature.
Everything else is derived.

### Why sections are shared, not per-user

Two students in the same lecture point at the *same* `sections` row (keyed on
`term_code` + `class_number`, which Quest guarantees unique). This means overlap is an
index lookup rather than a time-range comparison, and it means one person's paste
improves the data for everyone — a corrected room number propagates.

## 4. The parser

Input is whatever lands on the clipboard after Ctrl+A / Ctrl+C on Quest's class
schedule **List View**. Structure, confirmed against existing exporters:

```
CS 135 - Designing Functional Programs
  Class Nbr  Section  Component  Days & Times          Room       Instructor    Start/End Date
  4280       001      LEC        MWF 10:30AM-11:20AM   MC 4020    J Smith       09/08/2026 - 12/02/2026
  4281       101      TUT        Th 2:30PM-3:20PM      MC 4021    TBA           09/08/2026 - 12/02/2026
```

Facts the parser must handle, each of which breaks a naive implementation:

| Case | Handling |
|---|---|
| 12h vs 24h times | Quest honours a per-user setting. Detect `AM/PM` presence, parse both. |
| `TBA` in any column | Days/time TBA → skip the meeting, keep the enrollment. Room/instructor TBA → null. |
| `Th` vs `T` | Days are a run-on string (`MWF`, `TTh`, `MThF`). Tokenize longest-match: `Th` before `T`. |
| Multi-component courses | One course, several sections (LEC + TUT + LAB). All are enrollments. |
| Online / async | No room, sometimes no days. Keep as enrollment, no meetings. |
| Multiple date ranges | A section can meet in two blocks; each is its own meeting row. |
| Copy noise | Quest page copy includes nav chrome, "Enrolled" status icons, dropped courses. |

Design: **line-oriented state machine**, not one mega-regex. Course headers switch
state; rows accumulate into the current course. This is more debuggable than the
regex approach and degrades gracefully — a row it can't parse is reported to the user
rather than silently dropped.

The parser must be a pure function with no I/O so it can be tested exhaustively and
run client-side. Running it client-side matters: the raw paste never has to leave the
browser until the user has seen what was extracted and agreed to save it.

## 5. Overlap engine

**Shared classes.** Self-join on `enrollments.section_id`. Rank: same section (you
literally sit in the same room) > same course, different section > same course,
different component.

**Shared gaps.** Per weekday, a user's meetings sort into busy intervals; the
complement within campus hours (08:00–22:00) is their free intervals. Two users'
shared gap is the intersection, filtered to ≥ 30 minutes (shorter isn't enough to do
anything with). Computed on demand — it's cheap and schedules change.

**Free right now.** Shared gaps evaluated at `now`, scoped to accepted friends.

## 6. Privacy — non-negotiable

A class schedule is a location-by-hour map of a real person on a real campus. This is
the part of the build where being careless would do actual harm, so the defaults are
conservative even though looser defaults would grow faster.

- Default `discoverable = false`. A new user is not listed in any class roster until
  they opt in.
- **Room numbers are never shown to non-friends**, even for a shared section. Non-friends
  see "you share CS 135 LEC 001" — not where you'll be at 10:30 on Monday.
- Gap matching and "free right now" are **accepted-friends-only**. No exceptions.
- Aggregate counts ("23 people in your section") are shown to everyone; identities are
  not.
- Block is unilateral, immediate, and mutual-invisibility.
- One-tap full schedule delete, hard delete not soft.

Deliberately not built: any "who viewed your schedule" or proximity/location feature.
Both are engagement bait that turn a scheduling tool into a surveillance tool.

## 7. Stack

Next.js (App Router) on Vercel, Postgres (Neon), Drizzle ORM, email codes via Resend.
Parser is dependency-free TypeScript shared between client and server.

## 8. Launch sequence

1. Parser + paste flow working, no accounts — shareable as a standalone "did it read
   your schedule right?" test.
2. Auth + persistence.
3. Overlap + friends.
4. Soft launch to a small group, verify the parser against *their* real pastes across
   different programs. This is the highest-risk unknown and needs real inputs.
5. Frosh-week push.

Hard constraint: the frosh-week window closes around mid-September. Anything not done
by then should be cut rather than delaying launch.
