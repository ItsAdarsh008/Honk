# Deploying Honk

Honk is deployed and ready for beta testers. Sign-in is passkeys, so nothing
depends on an email arriving. This is what to ask testers for, what is switched
off and why, and everything already standing.

---

## Status

| | State |
|---|---|
| Deployed to Vercel | ✅ live at `honk-loo.vercel.app`, smoke test 20/20 |
| **Sign-in** | ✅ **passkeys — no email, no password, nothing to wait for** |
| Address verification | ⚠️ off. Nothing proves an address belongs to whoever typed it |
| Email codes | ⏸️ built and tested, switched off behind `emailCodesEnabled` |
| Sign in with Waterloo (Entra) | ⏸️ built, dormant, needs an app registration |
| Neon Postgres project `honk` | ✅ provisioned, all ten tables pushed |
| Privacy integration tests | ✅ 12/12 passing against the live database |
| Full suite | ✅ 184 tests, typecheck and build clean |
| Quest parser | ⚠️ has seen exactly one real paste |
| `DATABASE_URL` in Vercel | ✅ set for Production and Preview |
| `NEXT_PUBLIC_SITE_URL` | ✅ `honk-loo.vercel.app` — no personal domain in the URL |

---

## What is left

### The schools migration — done, and what it cost

**Run against production on 27 August 2026.** 13 queries, one transaction, 86
section rows backfilled, 13 users kept, both old unique constraints replaced.
Verified afterwards: all four columns present, `section_key` NOT NULL with no
nulls, `class_number` now nullable.

Leaving the instructions below because the lesson is worth more than the steps.
**Merging deployed the code without it, and the site was down for every account
until it ran** — every sign-in path starts with a select on `users`, that select
named a column that did not exist, and the route 500s. The symptom on screen is
"That didn't work. Try again.", which is indistinguishable from a wrong PIN, so
nobody reports it as an outage.

If a change ever again adds a column the running code reads, the migration goes
first and the merge second. There is no version of this app where those two can
be done in the other order.

### The steps, for the next time

Honk now runs at five universities, and that added three columns and changed two
unique constraints. **The database has to be migrated before this deploys**, or
every save fails against the live schema.

```bash
psql "$DATABASE_URL" -f scripts/migrate-schools.sql
npm run db:push          # read the prompts — see the warning below
```

> **`db:push` is not safe to run blind on this database.** On 2 Sep 2026 it
> proposed adding a `meetings_unique_slot` constraint that **already exists**,
> and offered to *truncate `meetings`* — every saved schedule in the product —
> to make room for it. There were no duplicate slots; drizzle-kit's
> introspection simply failed to match a constraint that was already there.
>
> It is still the right tool for a fresh database. On this one, read every
> prompt, and never pass `--force`. For an additive change, prefer the explicit
> SQL route in *Adding a table by hand* below.

It is idempotent and it keeps every existing row: each one is stamped
`waterloo`, and section identity carries over unchanged because Quest's class
number is still the key where there is one. Nobody's classmates move.

`db:push` alone is **not** enough. Two of the new columns are NOT NULL with a
value that has to be computed from rows already present, and push would either
fail or drop the old constraint with nothing replacing it. Run the file first.

On a fresh database, skip it — `db:push` builds the right shape from scratch.

`psql` is not installed on the machine this was built on, so it went through the
Neon console's SQL editor instead — paste the file from `begin;` to `commit;`
and press Run. The transaction wrapper is what makes that safe: a web editor
that mangles the paste produces a syntax error and a rollback, never a
half-applied schema.

### The `paste_samples` table — done

**Already applied to production, on 2 Sep 2026.** `npx vite-node
scripts/pull-samples.ts` now answers "No stored samples" rather than
`relation "paste_samples" does not exist`, which is how you tell.

It was created by hand rather than with `db:push`, for the reason in the
warning above — push wanted to truncate `meetings` on the way past. See
*Adding a table by hand* below for the shape that was used.

**Getting the order wrong here is not the outage the schools migration was.**
Worth saying plainly, because the rule above ("the migration goes first and the
merge second") is stated absolutely and this is the exception that proves it is
about *reads*. Nothing in a sign-in path touches `paste_samples`; the only
writer is `/api/schedule/sample`, which swallows its own failures by design, so
deploying before the push costs you the samples from that window and nothing
else. Run it first anyway — the cost of remembering the rule is lower than the
cost of deciding each time whether this one is the safe kind.

What lands in the table, and why it is drawn this narrowly, is in the comment on
`pasteSamples` in `src/lib/db/schema.ts`. The short version: beta schools only,
failed readings only, no user id, no IP, ninety days.

---

**Otherwise nothing blocking. Honk is ready for beta testers.**

Sign-in is passkeys — Face ID, a fingerprint, or a screen lock. No code, no
password, nothing that has to survive a mail gateway. That was the last thing
standing between Honk and other people using it, and it is gone: the account is
created by the device credential, so a filtered email cannot stop anybody
signing up.

### Send it to testers

`https://honk-loo.vercel.app` — the custom domain was removed deliberately, so
nothing about the URL carries a personal name.

Ask each of them for three things, in this order of usefulness:

1. **Their Quest paste, if it fails.** The parser has now seen exactly one real
   paste, from one program. `CHANGELOG.md` lists what is still unexercised —
   a dropped course above all, which fails silently by construction.

   At a beta school you no longer have to ask: a failed reading is stored on its
   own, and `npm run samples -- <school>` writes them to `paste-samples/` ready
   for `diagnose-paste.ts`. Still ask at Waterloo, which is out of beta and
   therefore records nothing — save those into `quest-samples/` by hand.
2. **Whether the passkey worked first time**, and on what — iOS, Android,
   Windows Hello, a browser password manager. This is the one flow nobody
   outside this machine has exercised.
3. **Two of them in the same course**, checking that neither sees the other
   until both turn discoverability on, and that gaps only appear after a
   request is accepted.

### What is switched off, and why it can come back

Email codes still exist end to end — routes, templates, rate limits, the daily
cap, tests. They are off, behind `emailCodesEnabled` on the sign-in screen.
Nothing was deleted, because a passkey is bound to a device and losing that
device currently means losing the account. If recovery matters more than the
deliverability headache, that prop is the whole switch.

`RESEND_API_KEY` and `EMAIL_FROM` are still set in Vercel and no mail is being
sent. Note that if codes ever go back on, the From address carries a personal
domain name — worth changing first, given the domain was removed from the URL
for exactly that reason.

Waterloo sign-in (Entra) is also built and dormant, waiting on an app
registration. It stays the best answer if Honk ever needs to prove somebody is
really a Waterloo student, which passkeys do not.

### The thing to revisit before frosh week

Passkey-only means **nothing verifies the address**. Anyone can type any
`@uwaterloo.ca` address and get an account under it, including one that is not
theirs, and nothing stops somebody outside the university joining at all.

For a closed beta with people you know, that is a fine trade and the reason it
was made. For an open frosh-week launch it is a poor one. What still protects
people is unchanged and is where SPEC section 6 always put it: `discoverable`
defaults false, identities are never shown to non-friends, and gaps and room
numbers need an accepted request. An impostor has to paste a convincing
schedule and be accepted by somebody before learning anything — but that is a
social barrier, not a technical one.

Turning email codes back on, or finishing the Entra registration, restores the
guarantee. Decide which before the launch, not during it.

---

## Making the email path work

Written after the first real sends were accepted and then filtered. This is
what "instant email" actually requires, why it is not currently happening, and
which levers move it.

### The fact that changes the whole calculation

**Honk only ever emails `@uwaterloo.ca` addresses.** The gate refuses everything
else before a message is composed. So Gmail's opinion of the sending domain is
almost irrelevant to the product — the Gmail test was a diagnostic, run to
prove the problem was not Waterloo-specific, and it did its job.

Exactly one receiver matters: `mx1.hc503-62.ca.iphmx.com`, Cisco Secure Email,
with Microsoft 365 behind it. That is a single gatekeeper for one organisation,
which is a much better problem than pleasing the open internet. Single
gatekeepers can be *asked*.

### What "instant" actually means

Nothing needs building for speed. Resend hands to Amazon SES and SES hands to
the receiving server in **under two seconds** — every send so far has been
accepted that fast, and the API confirms it. Delivery latency is not the
problem and never was.

Every delay observed happened *after* the `250 OK`, inside Waterloo's gateway,
which accepted the message and then held it. "Instant" is not a feature to
build. It is what happens by default the moment the gateway stops holding.

So the question is never "how do we make it faster". It is only ever "how does
this sender stop being treated as unknown".

### Three routes there, fastest first

**1. Ask IST to allowlist the domain.** Binary, complete, and it bypasses
reputation entirely. Cisco Secure Email is policy-driven: a safelist entry for
`send.adarshthoduvakkal.com` means Waterloo stops scoring the sender at all.
Because Waterloo is ~100% of Honk's recipients, this single change is the
difference between "sometimes, eventually" and "always, instantly". Days to
weeks, depending on IST.

The ticket text and message IDs are in "What you need to do" above. Lead with
the authentication results — SPF, DKIM and DMARC all passing is what separates
this request from every spammer who also emails IST.

**2. Warm the domain up.** No permission needed, works on every receiver at
once, but gradual: two to six weeks for a new domain to stop being treated as
unknown. Details below.

**3. Sign in with Waterloo instead.** Removes email from the critical path
rather than fixing it. Built and deployed; needs the app registration.

These are not exclusive. Do 1 and 2 together and treat 3 as the answer if
neither lands before term starts.

### The warm-up, concretely

Reputation is built by **consistent volume with real engagement**, and destroyed
by bursts. A sender that goes 0 → 5 → 0 → 500 is indistinguishable from a
compromised account, which is exactly the shape frosh week would produce
without preparation.

| | Codes per day | Where they should go |
|---|---|---|
| Days 1–3 | 5–10 | People you can ask in person to open it |
| Days 4–7 | ~20 | Friends, floormates, a class group chat |
| Week 2 | ~50 | Wider soft launch |
| Week 3 | 100+ | Approaching launch volume |

Roughly doubling every few days. Honk's natural volume is low — sessions last
60 days, so it is one email per student per two months — which means these
numbers are also a soft-launch plan, not extra work.

**Engagement matters more than volume.** The strongest positive signals a
receiver has are a human opening the message, moving it out of spam, marking it
*not spam*, and adding the sender to contacts. For the first twenty people,
just ask them. Twenty deliberate not-spam marks are worth more than a thousand
ignored sends.

**Use `EMAIL_DAILY_CAP` as the guardrail.** Set it to whatever the table above
says for this week. If a spike arrives early, Honk refuses on its own terms —
the sign-in screen shows the "out of codes for today" card and the student is
told to come back — rather than burning reputation on a burst. That mechanism
already exists and this is what it is for.

### What would make it permanently worse

- **Hard bounces.** Never send to an address that might not exist. This is why
  `npm run smoke` no longer emails a made-up `smoketest@uwaterloo.ca` and why
  `SMOKE_EMAIL` has to be set deliberately. Above roughly 5%, providers put the
  account under review; the *sending* stops, not just the delivery.
- **Spam complaints.** Gmail's ceiling is 0.3% and the practical target is
  0.1%. One complaint in a thousand sends. Unsolicited invites are how you get
  them.
- **Bursts after silence.** See the table.
- **Rotating the From address.** Reputation attaches to
  `hello@send.adarshthoduvakkal.com`. Keep it.

### Still worth fixing, in rough order of value

1. ~~The From address cannot receive replies.~~ ~~The link domain does not match
   the sending domain.~~ **Both done** — the two sections below say what changed.
2. **There is no feedback loop.** Honk cannot currently tell a delivered code
   from a quarantined one; `delivered` is all the API reports. A Resend webhook
   recording bounces, complaints and delays would make failure visible instead
   of silent, which is the thing that made this take an evening to notice.
3. **Google Postmaster Tools.** Free reputation dashboard, but only for Gmail —
   marginal here, given who the recipients are.

### The sending domain and the site now match

Mail comes from `hello@send.adarshthoduvakkal.com` and the links in it point at
`honk-loo.vercel.app`. Same root domain, which is one fewer thing for a
filter to hold against a sender it does not know — a message whose links go
somewhere unrelated to where it came from is a phishing shape.

`honk-loo.vercel.app` still resolves and still works. `NEXT_PUBLIC_SITE_URL` is
pinned to the custom domain, so that is what OG tags and invite links embed.

**Two things that must follow this.** The Entra redirect URI has to be
registered as `https://honk-loo.vercel.app/api/auth/entra/callback`,
exactly — if the app was already registered against the old hostname, add the
new one. And any invite link generated before the switch embeds the old origin;
harmless while nobody has one, worth knowing once people do.

### Replies do not vanish any more

`send.adarshthoduvakkal.com` now publishes a **null MX** (`0 .`, RFC 7505),
which is the standards-compliant way for a send-only domain to declare that it
never receives. An unexplained missing MX reads as suspicious; a null MX reads
as an ordinary transactional sender. A student who replies now gets an
immediate, clear bounce rather than silence.

Bounce handling is unaffected — those go to the Return-Path domain
`send.send.adarshthoduvakkal.com`, which keeps its own SES MX record.

If you want replies to reach you, set `EMAIL_REPLY_TO` to an address you
actually read and every code email carries it:

```bash
vercel env add EMAIL_REPLY_TO production --no-sensitive
```

That address becomes visible to every student who gets a code, so it should
probably not be your personal one. Resend's inbound forwarding is a paid
feature and cannot be switched on through the API; a free forwarder such as
ImprovMX works with Vercel DNS if you would rather have `hello@` itself
deliver, in which case replace the null MX with theirs.

### Do not buy a dedicated IP

It is the obvious-looking upgrade and it is wrong at this volume. A dedicated
IP has no reputation of its own and needs *sustained* traffic to build one —
the usual threshold is around 100,000 messages a month. Honk will send a few
thousand a year. On a shared pool you inherit Amazon SES's aggregate
reputation, which at this scale is far better than anything you could build
alone.

### How to know it is working

Send one code to a Waterloo address that has never received one, and time it.

- **Under a minute, in the inbox** → done. That is what instant looks like, and
  no further work is needed.
- **Arrives late** → still being throttled. Keep warming; re-test in a few days.
- **Never arrives** → still quarantined. The allowlist is the only fast fix.

`npm run smoke` cannot answer this. It checks that the endpoint replies, not
that mail lands — which is precisely the gap that made the original problem
invisible. Watch the Resend dashboard and a real inbox.

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

**`ADMIN_EMAIL` and `ADMIN_PASSWORD`** are the pair behind `/admin`. Both or
neither: with either unset the page 404s rather than showing a login, because a
form tells a stranger there is something there and a 404 tells them nothing. The
password also signs the admin cookie, so changing it signs you out everywhere.
Set them in Vercel for Production if you want the dashboard on the live site —
without them, `/admin` simply does not exist there.

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
in the repo root pins the org and project ids, and the schema is live —
thirteen tables as of 2 Sep 2026. The first nine came from `db:push`; the four
since (`study_groups`, `study_group_members`, `paste_samples`, and the indexes
on them) were added by hand, for the reason in the warning further up.
`.env.local` holds the pulled `DATABASE_URL` and is gitignored.

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
database. It is the right tool for standing an empty one up, and it stops being
the right tool the moment there are rows worth keeping: its diff is a guess
about what the database already has, and when that guess is wrong it offers to
delete a table to resolve the difference. It has already been wrong once here —
see the warning under *The steps, for the next time*.

Once real students have rows in there, switch to generated migrations
(`npm run db:generate`, committed to the repo) so you can read a change before
it runs.

### Adding a table by hand

For a purely additive change this is shorter than arguing with the diff, and it
cannot propose anything you did not write. Two things to know: `drizzle-kit`
does not read `.env.local`, so export `DATABASE_URL` yourself if you use it at
all; and `postgres.js` rejects a multi-statement `unsafe()` with
`UNSAFE_TRANSACTION`, so issue one statement per call inside the transaction.

```ts
import { getSql } from "../src/lib/db";
const sql = getSql();

await sql.begin(async (tx) => {
  await tx.unsafe(`create table if not exists paste_samples (
    id serial primary key,
    school_id text not null,
    parser text not null,
    outcome text not null,
    course_count integer not null default 0,
    warnings jsonb not null default '[]'::jsonb,
    raw_text text not null,
    created_at timestamptz not null default now()
  )`);
  await tx.unsafe(
    `create index if not exists paste_samples_school_idx on paste_samples (school_id)`,
  );
});
```

Then check it against `db/schema.ts` by reading
`information_schema.columns` back, rather than assuming the two agree.
`study_groups`, `study_group_members` and `paste_samples` were all added this
way.

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

```bash
npx neonctl branches create --project-id <id> --name pre-migration
```

That is a real safety net and not a ceremony — push has already offered to
truncate a table on this database once. A branch is a copy you can read the old
rows back out of; a truncate you agreed to at a prompt is not.
