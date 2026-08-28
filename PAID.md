# When Honk starts costing money

Two things: what changes if you buy a real domain, and where the free tiers
actually break.

Every price here is what it was in August 2026. Verify before relying on any of
it — the hosts change these more often than they change anything else.

---

## First: buying a proper domain

Vercel will sell you one (Project → Settings → Domains → Buy) and wire the DNS
itself, which is genuinely the easy path — around $20–40 a year for a `.ca` or
`.com`, no plan upgrade needed. Buying it is not the work. This is:

### The one that will actually bite you: passkeys break

`rpId()` in `src/lib/auth/passkey.ts` is the hostname of `siteUrl()`. WebAuthn
binds every credential to that hostname, permanently. Move from
`honk-loo.vercel.app` to `honk.ca` and **every passkey anyone has registered
stops working** — not "needs re-approval", stops existing as far as the browser
is concerned.

Nobody is permanently locked out, which is the only reason this is survivable —
but the way back in is worth understanding before you rely on it.

Someone who set a five-digit PIN signs in with address + PIN on the new domain
and enrols a fresh passkey. Someone who *only* ever used a passkey has no PIN,
and the sign-in form is going to ask for one they never chose. They get back in
by typing their address and any new PIN: `createPinUser` adds a PIN to an
account that has none rather than refusing. So it works, and it works because
of a hole that is already documented in `session.ts` — while email codes are
off, nothing proves an address belongs to whoever typed it, so *anyone* can
claim any PIN-less account that way.

That hole is pre-existing and unrelated to domains. It matters here only
because a domain move is the event that pushes every passkey-only user through
it at once, and each of them will experience it as "the app forgot me and then
asked me to invent a PIN".

So:

- **Do this early**, while the number of people affected is small. Today it is
  you and a handful of testers. In October it is a problem with a support queue.
- Decide the final hostname **once**. If there is any chance of moving to
  `app.honk.ca` later, go there now, or set `rpId` to the registrable domain
  (`honk.ca`) up front — a credential scoped to `honk.ca` keeps working on every
  subdomain, one scoped to `app.honk.ca` does not.
- Warn people before the switch, in the words that matter: *"you will have to
  set up Face ID again"*.

### The rest of the checklist

| What | Why | Where |
|---|---|---|
| Set `NEXT_PUBLIC_SITE_URL` to `https://honk.ca` in Production, then redeploy | It feeds `siteUrl()`, which feeds the passkey RP ID, OG tags, invite links and the Entra redirect. Vercel's own `VERCEL_PROJECT_PRODUCTION_URL` usually resolves right on its own, but this is not a thing to leave to "usually" | Vercel → Environment Variables |
| Keep the old `.vercel.app` domain attached | Every invite link already sent points at it. Vercel 308-redirects non-primary domains to the primary, so old links keep working | Vercel → Domains |
| Re-register the Entra redirect URI | `entraRedirectUri()` derives from the site URL, and Entra matches it exactly. Dormant today, silently broken later | Azure app registration |
| Move email sending to the new domain | `EMAIL_FROM` currently uses `send.adarshthoduvakkal.com`. Aligning the sending domain with the site is the whole reason that subdomain exists (`DEPLOY.md`), so it should follow | Resend → Domains, then `EMAIL_FROM` |
| Expect sender reputation to reset | A new sending domain has no history and gets filtered like a new one, because it is one. `DEPLOY.md` has the warm-up. Argues for keeping email switched off until it is needed | — |
| Nothing to do about cookies | `honk_session` is host-only, so sessions do not carry over. People sign in again once | — |

---

## Where the free tiers break

Short version: **not where you would guess.** Storage and bandwidth are nowhere
near binding. What runs out first is Neon *compute hours*, and it runs out
because of how long the database is awake, not how much it is asked.

### What one page load actually costs

`/home` is `force-dynamic`, so nothing is cached and every visit hits Postgres:

| Call | Queries |
|---|---|
| `getOptionalUser()` in the layout | 1 |
| `getOptionalUser()` again in the page | 1 |
| `getCurrentTermCode` | 1 |
| `getMyClassesWithCounts` | 3 |
| `getMySchedule` | 1 |
| `getFriendsWithNextGap` | 4 |
| `listIncomingRequests` | 1 |
| `getFreeNow` | 4 |
| **Total** | **~16** |

Sixteen small indexed queries is fine. It is the shape that matters: there is no
cache anywhere in that path, so cost scales linearly with page views, and every
view keeps the database awake.

### The thresholds

| Where you are | What breaks | What it costs to fix |
|---|---|---|
| **< 50 daily active users** | Nothing. Neon sleeps most of the day and free covers it comfortably | $0 |
| **~50–300 DAU** | **Neon compute hours.** This is the first wall and it arrives early | Neon Launch, ~$19/mo |
| **~300–2,000 DAU** | The 0.25 CU compute saturates at 11am and 5pm. The classmates N+1 below becomes visible in big lectures | Raise the autoscale ceiling (usage-based); fix the N+1 for free |
| **~2,000–10,000 DAU** | Vercel Hobby's function concurrency, and Web Analytics event caps | Vercel Pro, $20/mo |
| **10,000+ DAU** | Connection counts and read volume; one Postgres primary doing every read | Neon Scale ~$69/mo, read replicas, real caching |
| **Any revenue at all** | Vercel Hobby forbids commercial use, full stop — regardless of traffic | Vercel Pro, $20/mo |

### Why Neon goes first, in numbers

Neon's free plan gives roughly **190 compute hours a month** on a 0.25 CU
endpoint that scales to zero after about five minutes idle. A month is 730
hours.

The billing unit is *time the database is awake*, not queries. One query every
five minutes keeps it awake exactly as effectively as a thousand do. So:

```
190 hours ÷ 30 days ≈ 6.3 hours of wakefulness per day
```

Once Honk is being opened across more than about six hours of the day — which
is one student checking it between each class — the endpoint is effectively
always on and the free allowance is gone somewhere around **day nine**. The
symptom is not a bill. It is queries starting to fail two-thirds of the way
through the month, on a Tuesday, for everyone.

That threshold is a *usage spread*, not a user count. Fifty students who all
open it during the day will burn through it; five hundred who only ever look at
8am will not.

**Watch:** the compute-hours graph in the Neon console, around the 10th of the
month. If it is past a third, the month will not make it.

### Why storage is not the problem

Rows here are tiny and sections are shared rather than copied per student:

- a user ≈ 200 bytes
- an enrollment ≈ 50 bytes, about 7 per student per term
- meetings and sections are shared — 300 people in one lecture write **one**
  meetings row between them

Ten thousand students is on the order of **50 MB**, against 0.5 GB free. Storage
will not be the reason you pay. Neither will Vercel bandwidth: first load is
~110 kB, so the 100 GB allowance is roughly 900,000 page views.

### Email is currently free because it is switched off

Resend's free tier is 100 messages a day. Sign-in is passkeys and PINs right now
(`emailCodesEnabled` is off), so Honk sends nothing and the cap is irrelevant.

If codes come back on, that cap is the tightest limit in the whole system — 100
sign-ups a day, during frosh week, is nothing. `EMAIL_DAILY_CAP` already makes
Honk refuse just before Resend does, so the failure is a card explaining itself
rather than a broken form. Resend Pro is $20/mo for 50,000.

---

## Do these before paying anyone

All free, all worth more than the first upgrade.

### 1. ~~The classmates N+1~~ — done

`getClassmates` used to run one query per classmate: 40 round trips in a
tutorial, 300 in a first-year lecture, and getting slower precisely as Honk got
more popular. It now calls `relationshipsWith` in `friends.ts`, which resolves
the whole roster in one query regardless of the size of the room. Left here
because it is the shape to watch for, not because it still needs doing.

### 2. Deduplicate `getOptionalUser`

Both the layout and the page call it on every render, so every authenticated
page load runs the session lookup twice. Wrapping it in React's `cache()` makes
the second call free within a render. Two lines, ~6% of all queries.

### 3. Use the pooled connection string

`DEPLOY.md` says this already and it becomes load-bearing under an influx.
`src/lib/db/index.ts` opens `max: 5` per serverless instance; without the
`-pooler` host, a traffic spike exhausts Postgres connections and the site
returns 500s while the database sits nearly idle. This is the single most likely
way a sudden influx takes Honk down, and it is a hostname.

### 4. Cache the landing page's count

`getVisibleUserCount` already caches for 5 minutes, but per-instance — every
cold instance re-queries. Fine now; if the landing page ever gets shared widely,
move it to a route-level `revalidate`.

### 5. Know what to do at 3am

If it falls over during a spike, in order: check Neon is not out of compute
hours, confirm the pooled connection string, then raise the autoscale ceiling.
The first two are the cause almost every time.

---

## What a real month costs

| Scenario | Neon | Vercel | Resend | Domain | Total |
|---|---|---|---|---|---|
| Now — a few testers | $0 | $0 | $0 | $0 | **$0** |
| One campus, a few hundred DAU | $19 | $0 | $0 | ~$2 | **~$21/mo** |
| Five campuses, low thousands DAU | $19 + usage | $20 | $0 | ~$2 | **~$45/mo** |
| Gone properly viral | $69+ | $20 + usage | $20 | ~$2 | **~$120/mo** |

The honest read: this stays free longer than it feels like it should, and the
first bill is $19 for Postgres compute rather than anything to do with users.
Getting to $120 a month means tens of thousands of students are using it, at
which point the question stops being how to pay for it.
