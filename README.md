# Honk

Paste your class schedule, see who you share classes and free time with.
Live at Waterloo, York, Guelph-Humber, McMaster and Brock; every other Canadian
university is behind `/universities`, which asks for the one thing that blocks
adding a school — a real paste out of its portal.

Named after the campus geese. The name is the joke — the interface is calm.
See `SPEC.md` for the product spec, `DEPLOY.md` for getting it online, and
`CHANGELOG.md` for what was built, what was left out, and where the parser is
most likely to break.

## Status

| Piece | State |
|---|---|
| PeopleSoft parser (Quest, Mosaic) | ✅ 68 tests, one real Quest paste |
| Tolerant parser (York, Brock, Guelph-Humber) | ⚠️ 29 tests, **no real paste from any of them yet** |
| School registry + cross-school friends | ✅ 14 tests, 2 more integration tests |
| Overlap / shared-gap interval maths | ✅ 32 tests |
| Landing page + paste → review flow | ✅ runs client-side, no account needed |
| Database schema (Drizzle) | ⚠️ school columns need `scripts/migrate-schools.sql` run once |
| Session + school-address verification | ✅ 16 tests, routes wired |
| Classmate + shared-gap queries | ✅ screens built, 12 integration tests **passing on Neon** |
| Friend graph (request/accept/block) | ✅ screens built |
| `/home`, settings, profile, invite links | ✅ built |
| Email delivery via Resend | ⚠️ written, never exercised — console path only |

The paste flow works today with no database — it parses in the browser and
renders the schedule. That is deliberately step 1 of the launch sequence in
`SPEC.md`: it's shippable on its own as a "did it read your schedule right?"
test you can put in front of real students before building anything else.

## Running it

```bash
npm install
cp .env.example .env.local   # only needed once you wire up persistence
npm run dev
```

```bash
npm test           # 253 tests (239 unit + 14 integration, with .env.local present)
npm run typecheck
npm run build
npm run smoke -- <url>   # 21 checks against a deployed URL
```

With no `RESEND_API_KEY`, sign-in codes print to the server console instead of
being emailed, and the sign-in screen says so.

The privacy integration tests run as part of `npm test` whenever a
`DATABASE_URL` is present, and they currently pass against Neon.

## Layout

```
src/lib/quest/parse.ts         the parser — pure, no I/O, runs in the browser
src/lib/overlap/intervals.ts   free/busy interval maths
src/lib/overlap/queries.ts     classmate + shared-gap queries (privacy enforced here)
src/lib/friends.ts             ordered-pair friend graph
src/lib/schedule/save.ts       persists a parsed schedule; shared course/section rows
src/lib/schedule/validate.ts   validates a payload before it touches shared rows
src/lib/auth/session.ts        uwaterloo.ca gating, codes, sessions
src/lib/db/schema.ts           Drizzle schema
src/components/PasteFlow.tsx   paste → review
src/components/ScheduleGrid.tsx
src/app/home                   classes, people, free right now
src/app/settings               discoverability, blocks, deletes
src/app/u/[handle]             profile, shared gaps, block
src/app/i/[handle]             invite link → paste screen, no signup wall
```

## The two things most likely to bite

**The parser is the whole product's risk.** It has only been tested against
formats reconstructed from `SPEC.md` — no real Quest output has ever gone
through it. Before launch, collect ~10 real pastes from people in different
faculties and run them through. Every failure is a test case. `CHANGELOG.md`
lists the six specific failure modes I expect, in order of likelihood; the two
that fail *silently* rather than warning are worth checking by hand first.

**Privacy is load-bearing, not a setting.** A schedule is a location-by-hour
map of a real person. Rooms are never shown to non-friends and gap-matching is
accepted-friends-only — enforced in `src/lib/overlap/queries.ts`, not in the
UI. If you add a screen, do not re-query around those functions.
`src/lib/privacy-boundary.test.ts` fails the build if you do, and it runs
without a database so it cannot be skipped.

## Deploying

See `DEPLOY.md`. The short version: Neon for Postgres, Vercel for hosting,
Resend for the sign-in codes — and verify a sending domain in Resend before
telling anyone the URL, or nobody but you will be able to sign in.

## Next

1. Verify a sending domain in Resend. Until then nobody but you can sign in —
   the API returns 200 whether or not the mail is deliverable.
2. Look at the reveal screen on a real phone.
3. Soft-launch to a handful of people and fix the parser against their real
   pastes.
