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

In Vercel: **Add New → Project**, import the repo.

`vercel.json` pins `"framework": "nextjs"`, so the preset does not depend on
detection working. Confirm under **Settings → Build & Deployment** that:

- **Framework Preset** is *Next.js*, not *Other*
- **Root Directory** is empty (the app is at the repo root)
- **Output Directory** is on its default, i.e. the override toggle is **off**

If the preset is *Other*, the build fails with:

> No Output Directory named "public" found after the Build completed.

That is Vercel not running `next build` at all and looking for a plain static
site instead. **Do not create a `public/` folder to make it go away** — the
build would then "succeed" and deploy an empty directory, which is a worse
failure because it looks like it worked. Fix the preset instead. A `public/`
folder is optional in Next.js and this project does not have one.

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

In a private window, in this order:

1. **`/` loads and the paste box works with no account.** Paste a real Quest
   schedule. The grid should appear instantly. This is the one path that needs
   no database, so it working proves nothing about the rest.
2. **Sign in with a real `@uwaterloo.ca` address that is not yours.** The code
   should arrive by email within a few seconds. If it does not, go back to §4.
3. **A non-Waterloo address is refused.** `someone@gmail.com` should return
   "Honk is Waterloo-only…", not a server error.
4. **The schedule you pasted before signing in is saved.** It should be on
   `/home` without pasting again.
5. **The discoverability prompt appears once**, and only once — reload and
   confirm it does not come back.
6. **`/home` shows your classes** with counts.
7. **Link preview.** Paste your URL into iMessage or a Slack DM and confirm the
   OG card renders.
8. **Settings works**: toggle discoverability, then delete the schedule and
   confirm it is gone.

With a second account, on the same course:

9. **Neither of you sees the other** until you both turn discoverability on.
10. **Shared gaps appear only after a request is accepted**, not before.
11. **Block one from the other.** Confirm they vanish from both class rosters,
    and that the blocked side is told nothing.

Steps 9–11 are the ones worth doing by hand even though the integration tests
cover them.

---

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
- **The integration tests have not been run** unless you did §3.
- **Email delivery has never been exercised** — only the console path.
- **No load testing.** Free-tier Neon and a frosh-week spike have not met.

## 9. If you need to roll back

Vercel keeps every deployment. Deployments → the last good one → **Promote to
Production**. Instant, and it does not touch the database.

Schema changes are the exception: `db:push` is not reversible, so take a Neon
branch before any schema change once you have real users.
