# Deploying Honk

Honk is deployed and configured. One thing is still broken, and it is not in
the code: sign-in emails are accepted by the receiving server and then
filtered before anyone sees them. This is that problem, what is already
standing, and how to check it.

---

## Status

| | State |
|---|---|
| Neon Postgres project `honk` | ✅ provisioned, all nine tables pushed |
| Privacy integration tests | ✅ 12/12 passing against the live database |
| Deployed to Vercel | ✅ live at `honk-loo.vercel.app`, smoke test 20/20 |
| Full suite | ✅ 174 tests, typecheck and build clean |
| Vercel framework preset | ✅ pinned in `vercel.json` |
| Hosting domain | ✅ `*.vercel.app` is fine, no purchase needed |
| Sending domain in Resend | ✅ `send.adarshthoduvakkal.com` verified, DMARC at p=quarantine |
| **Mail reaching an inbox** | ❌ **accepted then filtered, by Gmail and Waterloo alike — the one blocker** |
| `DATABASE_URL` in Vercel | ✅ set for Production and Preview |
| `RESEND_API_KEY` in Vercel | ✅ set for Production and Preview |
| `EMAIL_FROM` | ✅ `Honk <hello@send.adarshthoduvakkal.com>` |
| `NEXT_PUBLIC_SITE_URL` | ✅ pinned to `honk-loo.vercel.app` |

---

## What is left

**Sign-in emails are being delivered and then filtered.** Everything else is
done and deployed. This is the one thing between Honk and other people using
it, and it is not a bug you can fix by changing code.

### What is actually happening

Three sends, three accepted, none seen:

| | |
|---|---|
| `athoduva@uwaterloo.ca` | `250 OK`, never reached the mailbox — not Inbox, not Junk, not in search |
| `athoduva@uwaterloo.ca` | same, six minutes later |
| a Gmail address | `250 OK`, filtered |

Authentication is not the problem and never was:

```
DKIM    verified   resend._domainkey.send.adarshthoduvakkal.com
SPF     verified   send.send.adarshthoduvakkal.com
MX      verified   send.send.adarshthoduvakkal.com
DMARC   published  _dmarc.send.adarshthoduvakkal.com  (p=quarantine)
```

Gmail's own 2026 sender rules are fully met, and transactional mail is exempt
from the one-click-unsubscribe requirement. What is missing is **reputation**.
The domain first sent mail on 26 August 2026 and has sent five messages ever.
A six-digit code from a domain with no history is shaped exactly like the
phishing that filters are tuned hardest against, and Gmail and Waterloo both
made the same call.

Waterloo is worth knowing about specifically: `uwaterloo.ca` MX points at
`mx1.hc503-62.ca.iphmx.com`, which is **Cisco Secure Email**, with Microsoft
365 behind it. So the quarantine holding those codes is Cisco's, not
Microsoft's — `security.microsoft.com/quarantine` will show nothing.

### What was changed in response

- **The email stopped looking like phishing.** The subject led with a bare
  number (`481902 is your Honk code`); it now leads with a word. The body says
  what Honk is, why the message arrived, and links to the real site, and the
  text and HTML halves say the same things. A unique `X-Entity-Ref-ID` per send
  stops Gmail threading a new code underneath an old one.
- **DMARC went to `p=quarantine`** with strict alignment. Only Resend sends
  from this subdomain and it aligns on both SPF and DKIM, so nothing legitimate
  is at risk, and Gmail expects progression past `p=none`.
- **A late code still works.** This was the one that mattered. Codes expired
  after 10 minutes, and the one code that did get through took somewhere
  between two minutes and two hours to appear — so every deliverability fix
  above could have worked perfectly while sign-in still failed, because the
  code was dead on arrival. The lifetime is now an hour. It costs almost
  nothing: requesting a code invalidates the previous one, so exactly one is
  ever live, and `MAX_CODE_ATTEMPTS` caps guesses at five against it. The
  brute-force surface is set by that cap, not by the clock.
- **The pasted schedule survives closing the tab.** It moved from
  `sessionStorage` to `localStorage`. Somebody waiting half an hour for a code
  will close the tab, and making them paste again afterwards is the most
  expensive possible moment to lose them. It still clears the instant the
  schedule saves.
- **The sign-in screen now has a "Didn't get it?" panel** telling students to
  check spam and mark the message *not spam*. That last part matters more than
  it sounds: recipient engagement is the strongest reputation signal there is,
  so every student who does it improves delivery for the next one.

None of that outweighs reputation. It stops the content counting against a
domain that has no credit to spend, which is all code can do here.

### What you need to do

**1. Warm the domain up. This is the fix — everything else is a detail.**

Reputation is earned by consistent low volume with real engagement. Send ten
to twenty codes over the next several days to people who will actually open
them, and ask each of them to drag it out of spam and mark it *not spam*. Do
not go from five messages to a frosh-week spike; that pattern is itself the
spam signature.

**2. Find the Waterloo quarantine and release what is in it.**

Cisco Secure Email sends periodic quarantine digest emails with a release link.
Search Waterloo mail for "quarantine" or "spam digest". Releasing a message is
also a positive signal.

**3. Open a ticket with IST — `helpdesk@uwaterloo.ca`.**

The evidence is unusually strong, so lead with it:

```
Sending domain: send.adarshthoduvakkal.com   (SPF, DKIM, DMARC all pass)
Provider:       Resend / Amazon SES us-east-1
Recipient:      athoduva@uwaterloo.ca
2026-08-26 06:04:23 UTC   id 058c0daa-6dc8-416c-bc85-f256c302263c
2026-08-26 06:10:22 UTC   id 5f3d0a42-20c6-4594-8075-062b2986b07d
Both accepted with 250 by mx*.hc503-62.ca.iphmx.com; neither reached the mailbox.
Request: allowlist the domain for a student project, or advise what is required.
```

**4. Re-test in a few days, not in an hour.** Reputation moves on the scale of
days. `npm run smoke` will not tell you — it checks that the endpoint answers,
not that mail arrives. Watch the Resend dashboard and a real inbox.

### The decision to make before frosh week

If mail is still being filtered a week from now, **email is the wrong hinge for
this product.** The entire app gates on a channel you do not control, and the
failure is invisible from your side: Resend reports `delivered` either way.

Waterloo runs Microsoft 365, so signing in with **Entra OAuth restricted to the
`uwaterloo.ca` tenant** would prove Waterloo membership with no email in the
path at all. It is a real change and today's evidence does not force it — and
it may need tenant admin consent from IST, which is not obviously faster than
an allowlist. But it removes the risk rather than mitigating it, and that
choice is much better made in August than discovered in September.

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

These five are everything the code reads:

| Variable | Required | What happens without it |
|---|---|---|
| `DATABASE_URL` | **Yes** | Pasting still works; accounts, saving and every screen behind sign-in return a plain "accounts are switched off" message rather than an error |
| `RESEND_API_KEY` | **Yes in production** | Codes print to the **server console** instead of being emailed — fine locally, useless once deployed |
| `EMAIL_FROM` | Recommended | Falls back to `Honk <onboarding@resend.dev>`, which can only send to your own address |
| `EMAIL_DAILY_CAP` | **No** | Defaults to 100, the Resend free tier. See "Running out of codes" below |
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

### Running out of codes

Resend's free tier stops at 100 messages a day. Left alone, the 101st student
sees "That didn't send" on a form that looks broken — during frosh week that is
indistinguishable from the app being down, and they don't come back.

So Honk counts its own sends over a rolling 24 hours and refuses just before
the provider would. `/api/auth/request-code` returns `503` with
`reason: "at_capacity"` and a `Retry-After`, and the sign-in screen swaps the
form for a card that says what happened, when to come back, and that the pasted
schedule is still held in the tab. The paste flow itself never depended on
sign-in, so the week still renders.

`EMAIL_DAILY_CAP` raises the ceiling — set it to match the plan if you upgrade.
It is ignored with no `RESEND_API_KEY`, since the console has no quota. If the
provider's own limit somehow trips first, that error is classified and shown as
the same card rather than a generic failure.

The daily cap is also the only thing bounding abuse. `/api/auth/request-code`
sends mail to any `@uwaterloo.ca` address without authentication, and the
per-email (5/hr) and per-IP (20/hr) limits do not stop somebody with a proxy
pool. The cost of that is small — Resend is not metered per message on the free
tier — but the **bounce rate** is not: made-up addresses hard-bounce, and above
roughly 5% a provider puts the account under review, which switches sign-in off
for everyone. A global ceiling is what keeps that bounded.

For the same reason `npm run smoke` no longer sends to a made-up address. Set
`SMOKE_EMAIL` to a real inbox you can read to check the accept side of the
gate; without it that one check is skipped and the run reports 20 rather than
21.

### Verify the privacy rules actually hold

The 12 integration tests in `src/lib/overlap/queries.integration.test.ts`
encode the SPEC section 6 rules — what a non-friend, a hidden user and a
blocked user cannot see. **They have now been run against real Postgres and
all pass**, so the guarantees are verified rather than merely asserted.

They are skipped unless `DATABASE_URL` is in the environment, and vitest does
not read `.env.local`, so pass it explicitly:

```bash
npm test                                   # 153 unit tests, 12 integration skipped
DATABASE_URL=postgres://... npm test       # all 165
```

That they are opt-in is deliberate. They create and delete real users, so
point them at a **branch or scratch database, never production once real
students are on it.** They clean up by deleting sections in term `9999` and
courses with subject `ZZ`.

---

### Email

**Done for this project.** `send.adarshthoduvakkal.com` is verified in Resend
and `EMAIL_FROM` is set to `Honk <hello@send.adarshthoduvakkal.com>`. Kept here
because the reasoning is what matters if you ever move domains.

Resend delivers only to **your own verified address** until a sending domain is
verified. Skip that and the deploy looks completely fine to you and is
impossible for anyone else to sign into. There is no error — the code sends,
and nobody receives it.

**You do not need to buy a domain.** A subdomain of one you already own works,
and is the better choice anyway.

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

### Pin the domain before sharing anything

Vercel has already moved this project's canonical hostname once, from
`honk-one.vercel.app` to `honk-loo.vercel.app`, with the old one left
307-redirecting to the new. `siteUrl()` follows `VERCEL_PROJECT_PRODUCTION_URL`
so it keeps up on its own, but two things do not: invite links already sent
embed the origin they were generated on, and some link-preview scrapers do not
follow redirects.

Set `NEXT_PUBLIC_SITE_URL` to whichever hostname you intend to give students
and it stops mattering. The smoke test warns when `og:image` and the tested
origin disagree, which is what caught the move.

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
npm run smoke -- https://honk-loo.vercel.app
```

It runs 20 checks and exits non-zero if any fail, so it can gate a deploy in
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
- **Honk's own send path has never reached a real inbox.** The domain is
  verified and a direct test send from `hello@send.adarshthoduvakkal.com` came
  back `delivered`, so the sender works. What is still unproven is the whole
  chain — Honk issuing a code, formatting the mail and handing it to Resend —
  landing in somebody else's inbox. That is check 1 under "What is left".
- ~~The deploy has never been exercised end to end.~~ **Done** — the app is
  live at `honk-loo.vercel.app` with `DATABASE_URL` wired, and the smoke test
  passes 20/20 against it.
- **No load testing.** Free-tier Neon and a frosh-week spike have not met.

Next was bumped 15.5.4 → 15.5.9 for a React Server Components CVE, and the full
suite passes on it. Keep taking those patches: Vercel opens them as pull
requests automatically.

## If you need to roll back

Vercel keeps every deployment. Deployments → the last good one → **Promote to
Production**. Instant, and it does not touch the database.

Schema changes are the exception: `db:push` is not reversible, so take a Neon
branch before any schema change once you have real users.
