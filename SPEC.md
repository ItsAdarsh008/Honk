# Honk — spec

A web app for Canadian university students: paste your class schedule, instantly see who
you share classes and free time with. Built to be launched during frosh week, when "what
classes are you in?" is the single most-asked question on campus.

Live at five schools — Waterloo, York, Guelph-Humber, McMaster and Brock — with every
other university in the country behind a beta-tester page. **This is a deliberate change
to the scope below, made after the Waterloo build worked.** See §9.

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
- ~~Non-Waterloo campuses~~ — **shipped**, see §9

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

## 9. More than one university

Added after the Waterloo build was working, and a deliberate reversal of the "non-Waterloo
campuses" exclusion in §2. The reasoning, so the reversal is not mistaken for drift:

The exclusion existed because a second campus with no users is worse than no second campus
— it dilutes the density that makes the app work at all. That argument is about *users*,
not about *code*, and it holds for launching a school with nobody in it. It does not hold
for being ready when somebody arrives. Meanwhile the cost of staying Waterloo-only turned
out to be paid in the wrong place: half of a Waterloo student's friends are at Laurier,
Mac, Western or Queen's, and "when are we both free" is a better question across campuses
than within one, because those are the friends you no longer bump into.

So: five schools live, everywhere else behind a page that asks for the one thing that
actually blocks a school being added.

### What makes a school

A school is a row in `lib/schools.ts` — a name, its email domains, its time zone, the
portal its students copy from, and which parser reads that portal's output. Nothing about
a school is in the database, because turning one on always means teaching the parser a new
format, which is a code change regardless.

### The two parsers

- **`peoplesoft`** — Oracle Campus Solutions, which Waterloo brands Quest and McMaster
  brands Mosaic. The same seven columns in the same order. Checked against a real paste.
- **`generic`** — everything else. Finds course codes and day/time runs anywhere in the
  text rather than expecting a fixed table. Reads York's REM, Brock's Self Serve and
  Guelph-Humber's Student Planning.

Both run on every paste and the better reading wins, so a wrongly-picked school or an
unexpected page still produces a schedule.

### Data model changes

- `users.school_id`, set from the email domain at sign-up and never changed.
- `courses` and `sections` are scoped to a school. `ECON 1000` at York and `ECON 1000` at
  Guelph-Humber are different rows; sharing them would put a student in another
  university's lecture roster.
- Section identity moved from `(term_code, class_number)` to `(school_id, term_code,
  section_key)`, because only PeopleSoft prints a class number.
- Term codes stay in Waterloo's format as Honk's internal one, derived from section dates.
  Two schools in the same autumn both land on `1269`, which is what lets their students
  appear in each other's shared-gap queries with no cross-school term mapping.

### What crosses a campus boundary and what does not

| | Across schools |
|---|---|
| Shared classes, class rosters, section counts | **No.** Structurally impossible — the rows are school-scoped. |
| Friend requests, handles, profiles | Yes |
| Shared free time, "free right now" | Yes |
| Room numbers | Only to accepted friends, exactly as within a school |

Every privacy rule in §6 is unchanged and applies identically. A cross-campus friend is an
ordinary friend who happens to share no classes.

### Time zones

Meetings are stored in the campus-local minutes the portal printed. Two people's minutes
only mean the same thing if their campuses keep the same clock, so a friend's week is
shifted into the viewer's zone before any gap is computed. Every live school is on Eastern
time, so the shift is currently zero — it exists so that the first school west of Ontario
does not silently show its friends free at the wrong hours.

### Adding the next school

1. Add the row to `lib/schools.ts` with `status: "waitlist"`.
2. Get one real paste from a student there. **This is the whole blocker**, and it is what
   `/universities` exists to ask for.
3. `npx vite-node scripts/diagnose-paste.ts <file> <school>` and fix what it could not read.
4. Add the paste to `parsers/generic.test.ts` and flip `status` to `"live"`.
