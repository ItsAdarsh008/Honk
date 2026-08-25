# Honk

Paste your Quest schedule, see who you share classes and free time with.
University of Waterloo only.

Named after the campus geese. The name is the joke — the interface is calm.
See `SPEC.md` for the product spec and `HONK_BUILD_PROMPT.md` for the brand
and the remaining build brief.

## Status

| Piece | State |
|---|---|
| Quest paste parser + 48 tests | ✅ done |
| Overlap / shared-gap interval maths | ✅ done |
| Landing page + paste → review flow | ✅ done, runs client-side |
| Database schema (Drizzle) | ✅ done, not yet migrated |
| Session + `@uwaterloo.ca` verification lib | ✅ done, routes not wired |
| Classmate + shared-gap queries | ✅ done, screens not built |
| Friend graph (request/accept/block) | ✅ done, screens not built |

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
npm test           # parser + interval tests
npm run typecheck
npm run db:push    # once DATABASE_URL is set
```

## Layout

```
src/lib/quest/parse.ts        the parser — pure, no I/O, runs in the browser
src/lib/overlap/intervals.ts  free/busy interval maths
src/lib/overlap/queries.ts    classmate + shared-gap queries (privacy enforced here)
src/lib/schedule/save.ts      persists a parsed schedule; shared course/section rows
src/lib/friends.ts            ordered-pair friend graph
src/lib/auth/session.ts       uwaterloo.ca gating, codes, sessions
src/lib/db/schema.ts          Drizzle schema
src/components/PasteFlow.tsx  paste → review
src/components/ScheduleGrid.tsx
```

## The two things most likely to bite

**The parser is the whole product's risk.** It is tested against the formats I
could confirm, but Quest output varies by program, term, and the student's own
12h/24h setting. Before launch, collect ~10 real pastes from people in
different faculties and run them through. Every failure is a test case.

**Privacy is load-bearing, not a setting.** A schedule is a location-by-hour
map of a real person. Rooms are never shown to non-friends and gap-matching is
accepted-friends-only — enforced in `src/lib/overlap/queries.ts`, not in the
UI. If you add a screen, do not re-query around those functions.

## Next

1. Wire the auth routes to `src/lib/auth/session.ts` (send code → verify → session).
2. Build `/home` — classmate list, friend requests, shared gaps.
3. Soft-launch to a handful of people and fix the parser against their real pastes.
