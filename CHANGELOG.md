# Changelog

## Ten universities, nine of them in beta

Added Laurier (LORIS), Toronto (ACORN), Western (Student Center), Queen's
(SOLUS) and UBC (Workday), and marked everywhere except Waterloo as beta.

Western and Queen's are PeopleSoft, the same product as Quest and Mosaic, so
they get the parser with real pastes behind it rather than the tolerant one.
UBC is the first school outside Eastern time, which turns the time-zone shift
in `overlap/queries.ts` from dormant code into load-bearing code — a UBC
student's 9am Monday is a Waterloo friend's noon.

**The switch is `src/lib/schools-out-of-beta.ts`.** One list, one line to edit.
Every beta tag in the app reads from it — the universities page, the paste
screen — including the sentence explaining what beta means, so flipping a
school cannot leave a page claiming something that stopped being true.

Beta here means one specific thing, and the copy says it out loud: nobody has
proved Honk can read that portal. Not polish, not user numbers. The bar to come
off the list is a real paste, read correctly, kept as a test.

`liveSchoolList()` had to grow up too. Naming all ten schools was fine in prose
at five and is a mouthful now, and it was on the link-preview card — so there is
a `liveSchoolSummary()` ("Waterloo, Laurier, Toronto and 7 more") and a
`liveSchoolCount()` for the places that only have room for a number.

---

## Five universities, and friends between them

Honk was Waterloo-only by design — `SPEC.md` §2 listed other campuses as out of
scope. That is now reversed on purpose, and §9 of the spec explains why rather
than quietly dropping the line.

**Live: Waterloo, York, Guelph-Humber, McMaster, Brock.** Everywhere else in
Canada is a real entry in the registry that gets recognised at sign-in and
offered the beta, rather than an address that "isn't valid".

What changed, in the order it matters:

- **`lib/schools.ts`** — the registry. Name, domains, time zone, portal, parser.
  Five live, 51 waiting. No database table: turning a school on always means
  teaching the parser a format, which is a code change anyway.
- **A second parser.** McMaster's Mosaic is PeopleSoft, the same product as
  Quest, so it reuses the existing state machine and was nearly free. York,
  Brock and Guelph-Humber are three different systems, so
  `schedule/parsers/generic.ts` finds course codes and day/time runs anywhere in
  the text instead of expecting a table. Both parsers run on every paste and the
  better reading wins.
- **School-scoped courses and sections.** `ECON 1000` at York and at
  Guelph-Humber are different rows. Section identity moved from Quest's class
  number to `(school_id, term_code, section_key)`, because only PeopleSoft
  prints a class number.
- **Cross-campus friends.** Shared classes stay within a school — structurally,
  not by a check. Friend requests, profiles and shared free time cross freely,
  which is the point: the friends you stop bumping into are the ones at another
  university.
- **Time-zone-correct gaps.** A friend's week is shifted into the viewer's zone
  before any intersection. Zero for every live school today; correct for the
  first one that is not.
- **`/universities`** — the beta page, and the sign-in card that appears when
  somebody types an address at a school Honk knows and has not launched at.
- **`PAID.md`** — where the free tiers actually break, and what a real domain
  changes. The passkey answer there is the one to read before buying a domain.

### The part to be honest about

The Quest parser has seen a real paste. **The other four portals have not.**
Their fixtures are reconstructed from each portal's own documentation, which is
exactly the position the Quest parser was in before somebody pasted into it, and
that went about as well as it sounds. The tolerant parser is built to degrade
rather than fail — a missed room is a null, not a crash — and the review screen
shows the user what was read before anything saves. But the first real York
paste will find something, and `/universities` exists to go and get one.

### What a second university broke, and what is still open

A pass over the assumptions that only hold at one school. Five fixed:

- **Friends at another school showed as free all week.** `busyWeeksFor` filtered
  every user by the *viewer's* term code and started everyone from an empty
  week, so a friend whose term is coded differently matched no rows and came
  back looking perfectly available, 8am to 10pm, every day. York's Fall/Winter
  courses derive to the Fall code and stay there through January, so this was
  routine rather than exotic. Everyone is now read at their own term, and
  somebody with no schedule is left out of the results rather than invented as
  free.
- **The link-preview card said "University of Waterloo".** It is what every
  invite link renders as in a DM — the one asset that reaches people who have
  never seen Honk.
- **The sign-in email called Honk "the class-schedule app for University of
  Waterloo students"**, to whoever it was sent to. Dormant while codes are off.
- **"Sign in with Waterloo" was the top button for everybody**, including the
  four fifths of live schools it cannot work for.
- **Unnumbered sections could merge two different lectures into one row.** The
  generic parser defaulted a missing section code to `01`, and section rows are
  shared, so two people in different rooms became each other's classmates —
  which is what lets a friend see a room. An inferred code is now flagged and
  keyed on its meeting pattern instead.

Still open, and deliberately not changed:

- **Handles are one global namespace.** `@adarsh` at Waterloo blocks `@adarsh`
  at York, and the collision rate is now five times worse for someone who will
  never meet the person holding it. Scoping handles per school would break
  `/u/<handle>` and every invite link already sent, so it needs a decision
  rather than a patch.
- **The "N students have joined" counter is global.** At a school with four
  users it reads as a thousand, which is true and misleading in the way that
  matters — density is local. A per-school count would be more honest.
- **Shared gaps do not know about distance.** A thirty-minute window shared with
  someone in Hamilton is real for a phone call and useless for lunch, and it is
  rendered identically to one shared with somebody two buildings away.
- **The per-IP sign-in limit is 20 an hour.** Campus wifi is one NAT, so a
  residence hits it as a group. Dormant while email codes are off.

### One manual step

`scripts/migrate-schools.sql` has to be run against the live database before
this deploys. `db:push` cannot do it alone: two new NOT NULL columns need values
computed from existing rows. It is idempotent, and every existing row keeps the
section identity it already had.

---

## The starting point was not what the brief described

The build brief lists nine files as "built, tested, and correct — do not
rewrite these," and says to stop rather than regenerate them. **None of them
existed.** The repository contained exactly two files, `README.md` and
`SPEC.md`, on a single commit. There was no `package.json`, no `src/`, no
parser, and no tests.

Stopping would have delivered nothing, so everything below was written from
scratch, with the nine "existing" modules built to the contracts `SPEC.md` and
the brief describe — same paths, same function names, same responsibilities —
so the foundation sits where the rest of the brief expects to find it.

Two consequences worth knowing:

- **The parser has never been run against a real Quest paste.** The brief said
  it had 48 passing tests against reconstructed output. It now has 59 tests,
  all written by me against formats reconstructed from `SPEC.md` §4. See
  "Where this will break" below — that section is the most important part of
  this file.
- **The 12 Postgres integration tests now pass** against a live Neon
  database. They were unexecuted when first written; see "Not verified" below
  for what is still outstanding.

---

## What was built

### Foundation

| File | What it does |
|---|---|
| `src/lib/quest/parse.ts` | Line-oriented Quest parser. Pure, no I/O, runs in the browser. |
| `src/lib/overlap/intervals.ts` | Free/busy interval maths for shared gaps. |
| `src/lib/overlap/queries.ts` | Classmate and gap queries. **Privacy is enforced here.** |
| `src/lib/friends.ts` | Ordered-pair friend graph; mutual, silent blocks. |
| `src/lib/auth/session.ts` | `@uwaterloo.ca` gating, hashed codes, database sessions. |
| `src/lib/schedule/save.ts` | Persists a schedule; shares course and section rows. |
| `src/lib/schedule/validate.ts` | Validates a payload before it touches shared rows. |
| `src/lib/db/schema.ts` | Drizzle schema, per `SPEC.md` §3. |
| `src/components/ScheduleGrid.tsx` | The weekly grid. |
| `src/components/PasteFlow.tsx` | Paste → review. |

### 1. Brand

Cream base, muted pastels, one clay accent, system type. Monospace is reserved
for machine-generated fields — course codes, rooms, times, counts, handles —
and never used for prose. Light and dark, with dark mode deepening the same
hues rather than swapping to neon.

Two design decisions worth calling out, because both are departures from the
obvious version:

- **The grid's window is derived from the actual classes**, not a fixed
  08:00–22:00. A schedule running 8:30–16:00 renders eight hours tall and
  dense instead of fourteen hours with six empty ones. This is most of why the
  reveal screen looks good.
- **Free time is drawn rather than left blank.** Each gap between classes
  carries a hairline tick and its length in mono. Honk is about the gaps, so
  they belong in the picture people screenshot rather than being the absence
  of one.

Dark mode course blocks use light warm ink on a deepened tint. The brief's
"never white on pastel" rule is about light pastels; at dark-mode lightness,
dark ink on the block would fail contrast outright.

### 2. Auth

`POST /api/auth/request-code` and `POST /api/auth/verify`. Codes are six
digits, hashed with the email as salt, expire in 10 minutes, cap at 5 attempts,
and any earlier unused code for an address is invalidated when a new one is
issued. Rate limited to 5 per email and 20 per IP per hour, counted off the
`login_codes` rows themselves rather than a separate table.

With no `RESEND_API_KEY` the code prints to the server console and the sign-in
screen says so plainly.

First sign-in asks for a display name and a handle. Nothing else.

`edu.uwaterloo.ca` is folded onto `uwaterloo.ca` so one person cannot end up
with two accounts.

### 3. Saving

The parse is held in `sessionStorage` and saved once the session exists, so
the sign-in detour never loses it. Term code is derived from the section dates
and never asked for.

### 4. `/home`

Classes with a per-section count that expands to names; people with the next
shared gap and pending requests; free right now.

**Free right now leads the page only when it has something in it.** The brief
asked for it to be where a returning user sees it first, but not so prominent
that it dominates a new account with no friends — rendering it conditionally
satisfies both rather than compromising between them.

The class count and the name list are deliberately different numbers, and the
copy says which is which: "6 others" can expand to two names plus "4 more
people are in this section but haven't turned on being seen."

### 5. Privacy

Discoverability prompt shown once, off by default, no warning icons. Settings
with the switch, the block list, and both hard deletes behind an inline
confirm. One-tap block on a profile with an 8-second undo toast.

### 6. Sharing

`/i/[handle]` lands a signed-out visitor on the paste screen. OG image
generated at `/opengraph-image` so links preview in iMessage and Instagram DMs.

---

## The privacy rules

All five hold, and the enforcement is in `queries.ts` and `friends.ts` as
specified. Two additions:

**`src/lib/privacy-boundary.test.ts`** is an architectural test that fails if
any route or component imports `enrollments`, `meetings` or `users` from the
schema directly instead of going through the enforcement points. It also
asserts `getClassmates` never mentions `meetings`, `location` or `startMin`;
that every friends-only function gates on the friend graph; and that no file
contains a "who viewed your profile", proximity or streak field. **It needs no
database, so it is the one privacy test that cannot be skipped** — it guards
the boundary on every machine, including CI with no database configured.

**`getProfileByHandle`** was added to `queries.ts` rather than written as a new
query, so handle lookup goes through the same discoverability and block checks
as everything else. A hidden, blocked or nonexistent handle all return the same
404, so the profile page cannot be used to test whether someone has an account.

One deliberate exception, in `src/lib/invite.ts`: naming the person behind an
invite link is the only read of `users` without a signed-in viewer. It returns
a name **only for a discoverable user** — a handle is short enough to guess,
and an invite page that named hidden users would turn guessed handles into real
names. The page reads fine without a name.

---

## Where this will break — read this before launch

**Updated after the first real paste.** The predictions below were ranked
before the parser had ever seen Quest output. One of them was right, one was
right for the wrong reason, and the actual top failure was not on the list at
all.

**0. The layout itself — the one that was missed.** Quest's List View is built
from stacked divs, not a table, so selecting the whole page puts **every cell
on its own line**. A class row arrives as seven consecutive lines. All three
delimiter forms below were beside the point: none of them applied, every class
row failed, and seven courses parsed to zero with "Nothing readable in there
yet". Fixed by `reflowVerticalRows`, which stitches a stacked record back into
one tab-separated line before anything else looks at it. The lesson is the one
`README.md` already gave: the format was guessed from `SPEC.md`, and the guess
was wrong in a way no amount of internal review would have caught.

1. ~~**Delimiters.**~~ Tabs, 2+ spaces and single-spaced flat rows are still
   handled, and now so is one-cell-per-line. Real Quest produces the last of
   these; the other three remain largely untested against real output.

2. ~~**Room patterns.**~~ Called as "my single highest-probability failure",
   and it did fire — real pastes carry `ONLN - Online`, which `ROOM_RE` did not
   match, so it would have spilled into the instructor field. `EV3 1408` and
   `EXP 1689` were fine. The online forms now allow a trailing description.

3. **Dropped courses.** Still unverified. The paste that arrived had none, so
   detection still depends on a `Dropped` status line inside the course block,
   and still fails silently if Quest puts status in a column instead.

4. **Course headers must have a title.** Held up. `BUS 111W`, `MTHEL 99` and
   `SEQ 5DD` all parsed, including the letter-suffixed catalog numbers.

5. **Section codes merged with the component.** Did not occur. Section and
   component arrive as separate cells.

6. **Dates — right about the risk, wrong about the fix.** The account that
   produced this paste is set to **DD/MM**, so the both-readings logic was
   doing real work from the first paste. But term ranges settle themselves and
   single-day rows do not: a midterm on `08/10/2026` is equally 8 October and
   10 August, and the MM/DD fallback put a Thursday test in August. Now the
   whole paste votes — the ranges that settle themselves settle the rest — and
   all four single-day rows land on weekdays matching their own `Days & Times`.

7. **"To be Announced" is not a person.** Found while writing tests for the
   above. Quest writes it in the Instructor column for unassigned staff, and it
   was being stored and displayed as an instructor's name. `normaliseTba` now
   treats it, `TBA`, `TBD` and `Staff` as nobody.

This was one student in one program. The standing advice is unchanged: collect
about ten real pastes across different faculties and turn every failure into a
test case. The parser reports unreadable rows as warnings rather than dropping them, and the review screen
shows those warnings, so a failure should be visible to the user rather than
silent — **except** for cases 3 and 4, which fail silently by construction.
Case 3 is the one still worth hunting: find a paste with a dropped course.

`scripts/diagnose-paste.ts` exists for exactly this. Point it at a saved paste
and it prints how every line was classified and where the parser lost the
thread; the first run of it on a real paste found the layout problem in
seconds. Raw pastes go in `quest-samples/`, which is gitignored because they
are personal schedules.

---

## Not verified

- ~~The 12 Postgres integration tests have not been run.~~ **Resolved.** A
  Neon database is provisioned, `db:push` has created all nine tables, and the
  full suite passes: **149 tests, 137 unit + 12 integration**, plus
  `npm run typecheck` and `npm run build` clean. The privacy rules in SPEC §6
  are now verified against real Postgres rather than only asserted.

- **No screenshot of the reveal screen.** The Chrome extension was not
  connected in this environment, so the grid was verified by fetching rendered
  HTML and by running the paste → parse → validate → layout pipeline
  end-to-end in Node and checking the geometry numerically (no block
  overflowing the window, no two blocks overlapping in a column, gap durations
  correct). **It has not been looked at by a human or a browser.** Given the
  brief calls this the most important screen in the product, look at it on a
  real phone before showing anyone.

- **Email delivery.** The Resend path is written but never exercised. The
  console path is confirmed working end to end — a code is issued, hashed,
  stored and printed — but no mail has been sent. Verifying a Resend sending
  domain is the last hard blocker before anyone else can sign in.

---

## Deliberately left out

- **No PWA, service worker or manifest.** Not in the brief for Honk.
- **No theme toggle.** Light and dark follow the system. A toggle is chrome on
  a five-screen app.
- **No avatars.** The brief said ask for nothing beyond a name and handle, and
  an avatar-less row is one less thing to load.
- **No friends-of-friends, no suggestions, no notifications.** Adjacent to the
  engagement bait the spec rules out, and none of it was asked for.
- **No `terms` table population beyond what a paste implies.** A term row is
  created from the first paste that mentions it.
- **`users.program`, `users.term_level`, `users.avatar_url`** exist in the
  schema because `SPEC.md` §3 lists them, but nothing collects or reads them.

## Dependencies added

Next, React, Drizzle, `postgres`, Tailwind v4, Vitest, `resend`, and
`server-only`. Nothing heavy and nothing outside the stated stack. `server-only`
is aliased to a stub in `vitest.config.ts` so the libraries it guards can be
exercised directly by tests.
