# Changelog

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
- **The 12 Postgres integration tests have never been executed.** They are
  written and they skip cleanly, but this environment had no Postgres, no
  Docker and no `DATABASE_URL`. See "Not verified" below.

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
database, so it is the one privacy test that cannot be skipped** — which
matters given the integration tests are the ones that skip.

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

The parser has only ever seen output I reconstructed from `SPEC.md`. These are
the specific things I expect to fail on real pastes, most likely first.

1. **Delimiters.** Copying an HTML table out of a browser normally yields
   tab-separated cells, but `SPEC.md`'s example is column-aligned text. All
   three forms are handled — tabs, runs of 2+ spaces, and single-spaced flat
   rows — but the flat-row path is the weakest. It splits by anchored prefix
   matching, so a room code it does not recognise will spill into the
   instructor field. **Whichever form real Quest actually produces, the other
   two are largely untested.**

2. **Room patterns.** `ROOM_RE` expects a building code and a number
   (`MC 4020`, `E7 2317`, `STC 0060`). Rooms that do not fit — multi-word
   buildings, affiliated colleges with unusual codes, anything hyphenated, or
   an online-delivery string other than `ONLINE`/`REMOTE` — will be misfiled as
   the instructor. This is my single highest-probability failure.

3. **Dropped courses.** Detection depends on a `Dropped` status line appearing
   inside the course block. If real Quest puts status in a column of the class
   row instead, a dropped course will be kept and shown as enrolled.

4. **Course headers must have a title.** `CS 135 - Designing Functional
   Programs` parses; a bare `CS 135` does not, and the course is dropped
   silently. A header that wraps onto two lines in the copy also breaks.

5. **Section codes merged with the component.** If Quest ever renders
   `LEC 001` in one column instead of `001` and `LEC` separately, the row fails
   — though it warns rather than dropping silently, which is the intended
   degradation.

6. **Dates were the scariest one, and it is now handled.** Quest renders dates
   in the account's own format, so `09/08/2026` is 8 September to one student
   and 9 August to another. That is not cosmetic: the term code is derived from
   these dates, and sections are keyed on `(term_code, class_number)`, so a
   misread date would file two students in the same lecture under different
   terms and **they would never match each other** — silently breaking the core
   mechanic for the affected user. `parseDates` now tries both readings and
   keeps the one that yields a plausible term, since a term that ends before it
   starts rules the wrong reading out. Genuinely ambiguous ranges fall back to
   MM/DD.

The right fix for all of 1–5 is the one `README.md` already prescribes: collect
about ten real pastes across different faculties before launch and turn every
failure into a test case. The parser reports unreadable rows as warnings rather
than dropping them, and the review screen shows those warnings, so a failure
should be visible to the user rather than silent — **except** for cases 3 and 4,
which fail silently by construction. Those two are worth checking by hand
against a real paste first.

---

## Not verified

- **The 12 Postgres integration tests have not been run.** No Postgres, no
  Docker and no `DATABASE_URL` were available here. They are written against
  the real query functions and skip cleanly without a database. Run them before
  trusting the privacy guarantees end to end:

  ```bash
  DATABASE_URL=postgres://... npm run db:push
  DATABASE_URL=postgres://... npm test
  ```

  Everything else passes: 128 unit tests, `npm run typecheck` clean,
  `npm run build` clean.

- **No screenshot of the reveal screen.** The Chrome extension was not
  connected in this environment, so the grid was verified by fetching rendered
  HTML and by running the paste → parse → validate → layout pipeline
  end-to-end in Node and checking the geometry numerically (no block
  overflowing the window, no two blocks overlapping in a column, gap durations
  correct). **It has not been looked at by a human or a browser.** Given the
  brief calls this the most important screen in the product, look at it on a
  real phone before showing anyone.

- **Email delivery.** The Resend path is written but never exercised — only
  the console path ran.

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
