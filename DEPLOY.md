# Deploying Honk

Getting the app as it stands today onto the internet and working end to end.
Roughly 30 minutes, most of it waiting on DNS.

Read [The thing most likely to block you](#the-thing-most-likely-to-block-you)
before you start. It is not the database.

---

## 1. What you need

| | Why | Cost |
|---|---|---|
| A Postgres database | Everything except the paste flow | Neon free tier is enough |
| A Vercel account | Hosting | Free tier is enough |
| A Resend account | Sign-in codes | Free tier is enough |
| A domain you control | **Required to email anyone but yourself** | ~$15/year |

Node 20 or newer. The app was built and tested on Node 24.

---

## 2. Environment variables

These four are everything the code reads:

| Variable | Required | What happens without it |
|---|---|---|
| `DATABASE_URL` | **Yes** | Pasting still works; accounts, saving and every screen behind sign-in return a plain "accounts are switched off" message rather than an error |
| `RESEND_API_KEY` | **Yes in production** | Codes print to the **server console** instead of being emailed — fine locally, useless once deployed |
| `EMAIL_FROM` | Recommended | Falls back to `Honk <onboarding@resend.dev>`, which can only send to your own address |
| `NEXT_PUBLIC_SITE_URL` | Recommended | Falls back to `http://localhost:3000`, which breaks link previews in iMessage and Instagram |

`NEXT_PUBLIC_SITE_URL` is the only one exposed to the browser, and it holds
nothing secret. The Resend key is server-only and must stay that way.

---

## 3. The database

Create a Postgres database (Neon: new project → copy the connection string).

**Use the pooled connection string.** On Neon it has `-pooler` in the hostname.
Vercel runs each request in its own short-lived instance and the app opens a
small pool per instance, so an unpooled string will exhaust connections as soon
as more than a handful of people are on at once.

Create the tables from your machine — this is a one-time thing, not part of the
deploy:

```bash
DATABASE_URL='postgres://...' npm run db:push
```

That is `drizzle-kit push`, which diffs the schema straight onto the database.
It is the right tool for standing this up now. Once real students have rows in
there, switch to generated migrations (`npm run db:generate`, committed to the
repo) so you can review a change before it runs.

### Verify the privacy rules actually hold

The 12 integration tests in `src/lib/overlap/queries.integration.test.ts`
encode the SPEC §6 rules — what a non-friend, a hidden user and a blocked user
cannot see. **They have never been executed.** Run them before you trust any of
the guarantees:

```bash
DATABASE_URL='postgres://...' npm test
```

Expect 137 unit tests plus the 12 integration tests, all passing.

Run them against a **branch or scratch database, never production.** They
create and delete real users, and they clean up by deleting sections in term
`9999` and courses with subject `ZZ`.

---

## 4. Email — the thing most likely to block you

Resend will only deliver to **your own verified address** until you verify a
sending domain. Skip this and the deploy will look completely fine to you and
be impossible for anyone else to sign into. There is no error — the code sends,
and nobody receives it.

1. Add your domain in Resend → Domains.
2. Add the DKIM and SPF records it gives you to your DNS. Propagation is
   usually minutes, occasionally hours.
3. Wait for the domain to read **Verified**.
4. Set `EMAIL_FROM` to an address at that domain, e.g. `Honk <hello@honk.app>`.

Test with an address that is not yours before you tell anyone about the site.

---

## 5. Deploy

```bash
git remote add origin git@github.com:<you>/honk.git
git push -u origin main
```

In Vercel: **Add New → Project**, import the repo. `vercel.json` pins
`"framework": "nextjs"`, so no build settings need changing.

Add the four environment variables under Settings → Environment Variables, for
Production **and** Preview. Deploy.

Then set `NEXT_PUBLIC_SITE_URL` to the real URL and redeploy once — it is baked
in at build time, so a value added after the fact will not take effect until
the next build.

### Custom domain

Add it in Vercel → Settings → Domains, point DNS at Vercel, then update
`NEXT_PUBLIC_SITE_URL` and redeploy. Do this before sharing any invite links —
they embed the origin they were generated on.

---

## 6. Smoke test

Most of this is automated. Point the script at the deployment:

```bash
npm run smoke -- https://your-honk-url
```

It runs 21 checks and exits non-zero if any fail, so it can gate a deploy in
CI. It covers the paste box rendering with no account, invite links landing on
the paste screen rather than a signup wall, `/home` and `/settings` redirecting
a signed-out visitor, all three icons serving, the OG image being an absolute
URL, the `@uwaterloo.ca` gate accepting and refusing the right addresses, every
sensitive API route refusing an unauthenticated caller, and no room numbers
appearing in signed-out HTML.

It also reports whether `DATABASE_URL` is wired, and warns if `og:image` points
at a different origin than the one you tested — which means
`NEXT_PUBLIC_SITE_URL` is wrong and link previews will break.

### What the script cannot check

Four things need a human, and they are the four that matter most:

1. **A code actually arriving in a real inbox.** Sign in with an
   `@uwaterloo.ca` address **that is not yours**. This is the only way to catch
   the Resend domain problem in section 4 — the API returns 200 whether or not
   the mail is deliverable.
2. **The paste survives sign-in.** Paste before signing in; after verifying,
   the schedule should be on `/home` without pasting again.
3. **Two accounts, same course.** Neither should see the other until both turn
   discoverability on, and shared gaps should appear only after a request is
   accepted. Then block one from the other and confirm they vanish from both
   rosters and the blocked side is told nothing.
4. **The link preview.** Paste the URL into iMessage or a Slack DM and look at
   the card.

Item 3 is covered by the integration tests, but it is worth ten minutes by hand
before real students are on it.

## 7. Things that will look broken and are not

**Nobody can see anyone.** `discoverable` defaults to **false**, by design —
a new user is in nobody's class roster until they opt in. On launch day this
looks exactly like the classmate feature being broken. It is §6 of the spec
working correctly.

**The signup counter is missing.** It renders nothing below 25 verified
accounts, because "3 students have joined" during frosh week does the opposite
of what the number is for. Change `MIN_VISIBLE_COUNT` in `src/lib/stats.ts` to
`0` if you would rather always show it.

**The counter is stale.** Cached five minutes per server instance.

**Class counts include people you cannot name.** Deliberate: the aggregate
counts everyone, the list names only those who opted in. The UI says so.

**A course has no room or time.** Online and async sections legitimately have
neither. They are kept as enrollments with no meetings.

**No timezone configuration anywhere.** `campusNow()` pins America/Toronto
explicitly, so "free right now" is correct regardless of where Vercel runs it.

---

## 8. What this deploy has not proven

Carried over from `CHANGELOG.md`, because it matters more once real people are
on it:

- **The parser has never seen a real Quest paste.** It is tested against
  formats reconstructed from `SPEC.md`. Collect ~10 real pastes across
  different faculties on day one and turn every failure into a test case.
  `CHANGELOG.md` ranks the six failure modes I expect; two of them fail
  silently rather than warning, so check those by hand first.
- **The integration tests have not been run** unless you did section 3.
  The automated smoke test in section 6 does not cover them — it checks what a
  signed-out stranger sees, not what two signed-in accounts see of each other.
- **Email delivery has never been exercised** — only the console path.
- **No load testing.** Free-tier Neon and a frosh-week spike have not met.

Next was bumped 15.5.4 → 15.5.9 for a React Server Components CVE, and the full
suite passes on it. Keep taking those patches: Vercel opens them as pull
requests automatically.

## 9. If you need to roll back

Vercel keeps every deployment. Deployments → the last good one → **Promote to
Production**. Instant, and it does not touch the database.

Schema changes are the exception: `db:push` is not reversible, so take a Neon
branch before any schema change once you have real users.
