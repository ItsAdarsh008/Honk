# Deploying Honk

Most of the setup is done. This is what is left, what is already standing, and
how to check it.

---

## Status

| | State |
|---|---|
| Neon Postgres project `honk` | ✅ provisioned, all nine tables pushed |
| Privacy integration tests | ✅ 12/12 passing against the live database |
| Deployed to Vercel | ✅ live at `honk-one.vercel.app`, smoke test 21/21 |
| Full suite | ✅ 155 tests, typecheck and build clean |
| Vercel framework preset | ✅ pinned in `vercel.json` |
| Hosting domain | ✅ `*.vercel.app` is fine, no purchase needed |
| **Sending domain in Resend** | ❌ **the one hard blocker** |
| `DATABASE_URL` in Vercel | ✅ set for Production and Preview |

---

## What is left

**One thing: verify a sending domain in Resend.** Everything else in this
section has been done — the code is pushed, `DATABASE_URL` is set for
Production and Preview, the app is deployed at `honk-one.vercel.app`, and the
smoke test passes 21/21.

### Verify a sending domain in Resend

**This is the only thing standing between you and other people being able to
sign in.** Until it is done, Resend delivers only to the address that owns the
Resend account, and it fails silently — the API returns 200 either way.

You already own two domains, both registered at Vercel and on Vercel
nameservers — `adarshthoduvakkal.com` and `origintutoring.com`. Use a
**subdomain**, not the apex, and prefer the personal domain: `origintutoring.com`
is a business that sends real mail, and the point of a subdomain is that a bad
send from Honk cannot touch it.

1. Resend → Domains → Add `send.adarshthoduvakkal.com`
2. Resend hands you a DKIM `TXT`, an SPF `TXT` and usually a `MX`. Because the
   nameservers are Vercel's, they go in from here rather than a DNS dashboard:

```bash
vercel dns add adarshthoduvakkal.com resend._domainkey.send TXT "p=MIGf..."
vercel dns add adarshthoduvakkal.com send TXT "v=spf1 include:amazonses.com ~all"
vercel dns add adarshthoduvakkal.com send MX feedback-smtp.us-east-1.amazonses.com 10
vercel dns ls adarshthoduvakkal.com          # confirm they are there
```

   Copy the values Resend actually shows you — the ones above are the shape,
   not the content, and the SES region in the MX record varies.

3. Wait for the status to read **Verified** — usually minutes
4. Add the two variables to Vercel, for Production **and** Preview:

```bash
vercel env add RESEND_API_KEY production     # paste the key when prompted
vercel env add RESEND_API_KEY preview
vercel env add EMAIL_FROM production         # Honk <hello@send.adarshthoduvakkal.com>
vercel env add EMAIL_FROM preview
```

5. Redeploy, because environment variables are read at build time:

```bash
vercel redeploy $(vercel ls honk | grep Production | head -1 | grep -o 'https://[^ ]*')
```

6. Re-run the smoke test and then sign in with a Waterloo address **that is not
   yours** — the one check no script can do.

The subdomain also keeps you off the apex SPF record, which is the record that
would break existing mail on a domain you already send or receive from.

### Paste values without quotes

`.env.local` wraps values in double quotes and dotenv strips them; a hosting
dashboard does not. A `DATABASE_URL` pasted with its quotes intact reached
`postgres()` as `"postgresql://..."` and threw `TypeError: Invalid URL` on the
first query — which surfaced as a bare 500 on sign-in with nothing on the page
to say why. `normalizeDatabaseUrl` in `src/lib/db/url.ts` now strips a matched
pair of surrounding quotes, so this particular mistake is survivable, but paste
the bare value anyway.

### Checking it

```bash
npm run smoke -- https://honk-one.vercel.app
```

21 automated checks, exits non-zero if any fail. Then the four manual ones
under "What the script cannot check" — the first is signing in with a Waterloo
address **that is not yours**, which is the only way to catch a Resend problem.

---

## Already done — for reference

### What you need

| | Why | Cost |
|---|---|---|
| A Postgres database | Everything except the paste flow | ✅ Neon free tier |
| A Vercel account | Hosting | free tier is enough |
| A Resend account | Sign-in codes | free tier is enough |
| A domain you control | **Required to email anyone but yourself** | you already own two — use a subdomain |

Node 20 or newer. The app was built and tested on Node 24.

---

### Environment variables

These four are everything the code reads:

| Variable | Required | What happens without it |
|---|---|---|
| `DATABASE_URL` | **Yes** | Pasting still works; accounts, saving and every screen behind sign-in return a plain "accounts are switched off" message rather than an error |
| `RESEND_API_KEY` | **Yes in production** | Codes print to the **server console** instead of being emailed — fine locally, useless once deployed |
| `EMAIL_FROM` | Recommended | Falls back to `Honk <onboarding@resend.dev>`, which can only send to your own address |
| `NEXT_PUBLIC_SITE_URL` | **No** | Falls back to Vercel's own `VERCEL_PROJECT_PRODUCTION_URL`, then `VERCEL_URL`, then localhost. On Vercel it resolves correctly unset — set it only for a custom domain |

`NEXT_PUBLIC_SITE_URL` is the only one exposed to the browser, and it holds
nothing secret. The Resend key is server-only and must stay that way.

It also tolerates being written wrong: a bare `honk.vercel.app` with no scheme,
a trailing slash, or an empty string all normalise instead of throwing. That
used to fail the whole build with `TypeError: Invalid URL`.

`DATABASE_URL` now tolerates the same mistake in its own way. A value copied
out of `.env.local` carries the double quotes that file uses; dotenv strips
them locally, a hosting dashboard does not, and `postgres()` threw
`TypeError: Invalid URL` on the first query — a bare 500 on sign-in with
nothing on the page to explain it. `normalizeDatabaseUrl` in
`src/lib/db/url.ts` strips a matched pair of surrounding quotes and trims
whitespace. Paste the bare value anyway.

---

### The database

**Already done for this project.** A Neon project named `honk` exists, `.neon`
in the repo root pins the org and project ids, and `npm run db:push` has been
run against it — all nine tables are live. `.env.local` holds the pulled
`DATABASE_URL` and is gitignored.

To repeat this on a fresh machine, or for a second environment:

```bash
npx neon@latest init      # auth, pick org + project
npx neon env pull         # writes DATABASE_URL into .env.local
npm run db:push           # creates the tables
```

**Use the pooled connection string.** On Neon it has `-pooler` in the hostname.
Vercel runs each request in its own short-lived instance and the app opens a
small pool per instance, so an unpooled string will exhaust connections as soon
as more than a handful of people are on at once.

`db:push` is `drizzle-kit push`, which diffs the schema straight onto the
database. It is the right tool for standing this up now. Once real students
have rows in there, switch to generated migrations (`npm run db:generate`,
committed to the repo) so you can review a change before it runs.

### Verify the privacy rules actually hold

The 12 integration tests in `src/lib/overlap/queries.integration.test.ts`
encode the SPEC section 6 rules — what a non-friend, a hidden user and a
blocked user cannot see. **They have now been run against real Postgres and
all pass**, so the guarantees are verified rather than merely asserted.

They are skipped unless `DATABASE_URL` is in the environment, and vitest does
not read `.env.local`, so pass it explicitly:

```bash
npm test                                   # 143 unit tests, 12 integration skipped
DATABASE_URL=postgres://... npm test       # all 155
```

That they are opt-in is deliberate. They create and delete real users, so
point them at a **branch or scratch database, never production once real
students are on it.** They clean up by deleting sections in term `9999` and
courses with subject `ZZ`.

---

### Email

Resend will only deliver to **your own verified address** until you verify a
sending domain. Skip this and the deploy will look completely fine to you and
be impossible for anyone else to sign into. There is no error — the code sends,
and nobody receives it.

**You do not need to buy a domain for this.** A subdomain of one you already
own works, and is the better choice anyway.

1. Add `send.yourdomain.com` in Resend → Domains.
2. Add the DKIM and SPF records it gives you at whoever runs your DNS.
   Propagation is usually minutes, occasionally hours.
3. Wait for the domain to read **Verified**.
4. Set `EMAIL_FROM` to an address there, e.g.
   `Honk <hello@send.yourdomain.com>`.

Use a subdomain rather than the apex. It keeps Honk's sending reputation
separate from your personal mail, and it means you never touch the apex SPF
record — which is what would break existing mail on a domain you already send
or receive from.

The hosting domain is a separate question and needs nothing: `*.vercel.app` is
fine. Only the *sending* domain has to be one you control, because only that
one needs DNS records.

Test with an address that is not yours before you tell anyone about the site.

---

### Deploying from scratch

```bash
git remote add origin git@github.com:<you>/honk.git
git push -u origin main
```

In Vercel: **Add New → Project**, import the repo. `vercel.json` pins
`"framework": "nextjs"`, so no build settings need changing.

Add the environment variables under Settings → Environment Variables, for
Production **and** Preview. Deploy.

They are read at build time, so a value added after a deploy does not take
effect until the next one.

### Custom domain — optional

`*.vercel.app` works fine and needs no configuration. If you later want a
shorter URL for the frosh-week push, add it in Vercel → Settings → Domains,
point DNS at Vercel, then set `NEXT_PUBLIC_SITE_URL` to it and redeploy. Do
that before sharing invite links — they embed the origin they were generated
on.

---

## Smoke test

Most of this is automated. Point the script at the deployment:

```bash
npm run smoke -- https://honk-one.vercel.app
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
   the Resend domain problem above — the API returns 200 whether or not
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

## Things that will look broken and are not

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

## What this deploy has not proven

Carried over from `CHANGELOG.md`, because it matters more once real people are
on it:

- **The parser has never seen a real Quest paste.** It is tested against
  formats reconstructed from `SPEC.md`. Collect ~10 real pastes across
  different faculties on day one and turn every failure into a test case.
  `CHANGELOG.md` ranks the six failure modes I expect; two of them fail
  silently rather than warning, so check those by hand first.
- ~~The integration tests have not been run.~~ **Done** — all 12 pass against
  the live Neon database, so the privacy rules are verified. The automated
  smoke test does not replace them: it checks what a signed-out
  stranger sees, not what two signed-in accounts see of each other.
- **Email delivery has never been exercised.** The console path is confirmed
  working (a code is issued and printed), but no mail has been sent through
  Resend. This is the one remaining hard blocker — see "What is left" above.
- ~~The deploy has never been exercised end to end.~~ **Done** — the app is
  live at `honk-one.vercel.app` with `DATABASE_URL` wired, and the smoke test
  passes 21/21 against it.
- **No load testing.** Free-tier Neon and a frosh-week spike have not met.

Next was bumped 15.5.4 → 15.5.9 for a React Server Components CVE, and the full
suite passes on it. Keep taking those patches: Vercel opens them as pull
requests automatically.

## If you need to roll back

Vercel keeps every deployment. Deployments → the last good one → **Promote to
Production**. Instant, and it does not touch the database.

Schema changes are the exception: `db:push` is not reversible, so take a Neon
branch before any schema change once you have real users.
