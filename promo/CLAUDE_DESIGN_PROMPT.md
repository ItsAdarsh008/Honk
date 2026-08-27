# Prompt for Claude Design

Paste everything below the line into Claude Design. Attach the files listed in
§8 at the same time. Adarsh — read §9 first; there are two copy decisions in
here that are yours, not the designer's.

---

You are designing the launch assets for **Honk**, a class-schedule app for
university students. I need a profile picture and two Instagram carousels. All
the brand material you need is attached; the visual system below is not a
suggestion, it is the house style, and the app already ships in it.

## 1. What Honk is, in one paragraph

You paste your class schedule into Honk once. It reads it, lays your week out,
and then does the thing no timetable app does: it lines your schedule up
against everyone else's. You see who is in your lectures, tutorials and labs —
the people taking the same courses you are, who you would otherwise take a
month to meet. And for the friends who aren't in any of your classes, you add
each other and Honk works out the windows you are both free, so nobody has to
compare timetables in a group chat again.

The name is a joke about campus geese. **The name is the only joke.** The
interface is quiet, warm and slightly clinical — a well-made tool, not a
party flyer. One goose in the corner and no more: no geese in empty states,
no honking, no goose emoji in buttons.

Voice: plain, short, a little dry. Sentences a tired student reads in one pass.
Never exclamation marks, never "revolutionize", never "🚀", never "game-changer",
never second-person hype. If a line sounds like a startup wrote it, cut it.

## 2. The visual system — hold to this exactly

**Colour.** Warm cream ground, muted pastels, exactly one accent. Nothing is
allowed to be loud.

| Token | Hex | Use |
|---|---|---|
| cream | `#FDFBF6` | every page ground |
| surface | `#FFFFFF` | cards |
| sunken | `#F7F4ED` | chips, inputs, placeholder frames |
| border | `#EAE5DA` | hairlines |
| border-strong | `#DDD6C7` | dashed frames, gap ticks |
| ink | `#33322C` | all body and heading text |
| ink-soft | `#75726A` | secondary text |
| ink-faint | `#A5A096` | mono metadata, captions |
| **clay** | `#C97B4A` | **the only accent.** Buttons, kickers, "today" |
| clay-soft | `#F7EBE2` | accent ground behind a chip |

Class blocks — pastel ground, dark ink, never white on pastel:
`#B5CDAA` `#F3CBA5` `#AFC8DE` `#DCBBD1` `#EDDDA4` `#C7BADD`

**Type.** One sans for anything a human wrote, one mono for anything a machine
generated. That split is load-bearing: course codes, room numbers, times,
durations, counts, slide numbers and the URL are **always mono**; headlines and
body copy are **always sans**. It makes the thing read as a spec sheet rather
than a dashboard. Use Inter (or the system sans) and a plain grotesque mono —
JetBrains Mono or IBM Plex Mono are both fine.

Scale on a 1080×1350 slide: kicker 24 mono uppercase, letterspaced, in clay ·
headline 68/82 semibold, tracking −1.6 · body 30/46 regular in ink-soft ·
metadata 18–24 mono in ink-faint.

**Structure.** Hairline borders, **never shadows**. Seams visible and
deliberate. 30px radius on cards, 14px on class blocks, 8–10px on chips.
Nothing pill-shaped, nothing floating, no gradients. 84px margins.

**Explicitly rejected:** dark mode with neon accents, glow, blur, glass,
3D, drop shadows, confetti, gradient meshes, stock photos of students
laughing, phone mockups with hands, any colour outside the table above,
and any second accent colour. The moment a second accent appears the feed
becomes a fruit salad.

## 3. Deliverable A — profile picture

1080×1080, exported PNG. Instagram circle-crops it and shows it at ~110px on a
phone and ~32px in a comment thread.

The attached `brand/honk-goose.svg` is the app's actual mark: a Canada goose in
profile facing right, charcoal head and neck, the white chinstrap, clay body,
paler belly, hairline outline.

**It is a 32px favicon and it does not survive enlargement** — see
`profile-picture/honk-pfp-safe-area.png`, where the chinstrap swells into a
white moon and the body reads as a cooking pot. So: **redraw the bird at size.**
Keep the species, the pose, the palette and the chinstrap; rebuild the curves so
they hold at 1080px and still read at 32px. `profile-picture/honk-pfp-size-test.png`
is the test to beat — the right-hand end of that row is the one that matters.

Give me three options:

- **A.** Clay bird, cream ground. The safest and the closest to the app.
- **B.** Cream bird, clay ground. Higher contrast in a feed of other avatars.
- **C.** Your call — one idea I haven't had. It still has to be one goose, in
  the palette above, legible at 32px.

Keep the bird inside the inner circle in `honk-pfp-safe-area.png`. No wordmark:
"Honk" is unreadable at avatar size and the handle is right next to it anyway.

## 4. Deliverable B — carousel 1, "what Honk does"

Three slides, 1080×1350, in the shell from §2. Every slide carries the same
header (goose + "Honk" top-left, mono `01 / 03` top-right) and the same footer
(hairline, then `honk-loo.vercel.app` in mono). That repetition is what makes
three images read as one object.

Drafts of all three are attached in `slides/post-1-what-it-does/`. Treat them as
the layout and the copy; make them good.

### Slide 1 — the core idea

- Kicker: `WHAT IT DOES`
- Headline: **See who is actually in your classes.**
- Body: Paste your schedule once. Honk lines it up against everyone else's and
  shows you who shares your lectures, tutorials and labs — the people in your
  program you would otherwise take a month to meet.
- Art: a week grid, five columns, pastel class blocks with mono course codes and
  room numbers, hour rules and an hour gutter. One course repeated across
  Mon/Wed/Fri with a darker outline, to show the same class recurring. Draw the
  gap between two classes as a hairline tick with its length beside it in mono
  (`1h 40m`) — free time is a *thing* in this product, not an absence, and that
  detail is the one worth putting in front of people.

### Slide 2 — friends in other programs · **needs a screenshot from me**

- Kicker: `DIFFERENT PROGRAMS`
- Headline: **Not in the same classes? Add them anyway.**
- Body: Your friends in other faculties never turn up in your lectures. Add each
  other and Honk works out the gaps you both have free — every overlapping
  window, half an hour or longer.

**Before you design this slide, ask me for the screenshot.** I am supplying a
real capture of the "When you're both free" screen and it is the whole point of
the slide — do not invent the UI, and do not proceed with a placeholder. Once I
send it: sit it on the cream ground inside a hairline-bordered card, corners
rounded to match, no device frame, no shadow, no tilt, no hand holding a phone.
Crop to the content, don't shrink a whole screenshot to fit.

`02-different-programs-ALT-mocked.png` shows roughly what that screen contains
(day, time range, duration — all mono) so you can compose around it while you
wait. It is a stand-in, not art to ship.

### Slide 3 — the call to action

- Kicker: `SIGN UP`
- Headline: **Get on Honk.**
- Body: Paste your schedule, add the people you already know, and stop sending
  "when are you free" into four different group chats.
- A clay button, full width, mono `honk-loo.vercel.app`.
- Under it, in sans: **Free, and open to every Canadian university.** Then, in
  ink-soft: School email, a schedule, about a minute.
- The goose, once, at the bottom. No footer URL on this slide — the button
  already carries it.

## 5. Deliverable C — carousel 2, the tutorial

Eight slides, same shell, mono `01 / 08` … `08 / 08`. Drafts in
`slides/post-2-tutorial/`.

Slides 2–7 each hold one screenshot. I am supplying those too — **ask me for
them, and design around the real captures rather than mockups.**
`screenshots/README.md` lists exactly what I'm capturing for each step.

| # | Kicker | Headline | Body |
|---|---|---|---|
| 1 | `TUTORIAL` | How to get on Honk. | About a minute. One step needs a laptop; the rest is your phone. *(Art: the six steps as a mono numbered list in hairline rows — a contents page.)* |
| 2 | `STEP 01` | Open Quest on a laptop. | Enroll → My Class Schedule, then switch to List View. Quest's mobile site has no schedule page, so this one step needs a real keyboard. Everything after it works fine on your phone. |
| 3 | `STEP 02` | Select the whole page and copy it. | Ctrl+A, then Ctrl+C. Headings, nav junk and all — Honk reads the useful bits and throws the rest away. Do not tidy it up first. |
| 4 | `STEP 03` | Paste it into Honk. | Your week appears as you paste. It is read in your browser, so nothing has been sent anywhere yet. Check the rooms and times look right, then save. |
| 5 | `STEP 04` | Sign in with your school email. | Then a five-digit PIN you make up on the spot — deliberately not your school password, so there is nothing worth reusing. A six-digit code lands in your inbox. Pick a name and a handle and you are in. |
| 6 | `STEP 05` | Send your link to three people. | Honk is worth nothing with one user. Shared classes appear on their own; shared free time only shows up once you have both added each other. |
| 7 | `STEP 06` | Then check who is free right now. | Between classes, open Honk instead of the group chat. It already knows who has a gap where you have a gap, and how long it lasts. |
| 8 | `THAT'S IT` | Go paste your schedule. | Honk is free, and open to every Canadian university. *(Clay button, mono URL, goose underneath, no footer URL.)* |

Keyboard shortcuts (`Ctrl+A`), course codes, the PIN and the URL are all mono.

## 6. Also useful, if you have time

- A 1080×1920 story version of slide 1 + the CTA. A draft is in
  `slides/extras/story-cta.png`.
- A 1080×1080 crop of slide 1 for the grid, if the 4:5 crop loses the week.

## 7. How to hand it back

PNG at exactly 1080×1350 (stories 1080×1920, avatar 1080×1080), plus editable
source. Name files `post-1-01.png`, `post-1-02.png`, … so they upload in order —
Instagram sorts by filename and a carousel out of order is a wasted post.

## 8. Files attached

```
brand/honk-goose.svg              the mark, exactly as the app ships it
brand/honk-goose-display.svg      same geometry, outline corrected for large use
brand/honk-lockup.svg             goose + wordmark, horizontal
brand/palette.png                 every hex above, as swatches
profile-picture/*.png             the three PFP references + the size test
slides/post-1-what-it-does/*.png  three layout drafts, copy set
slides/post-2-tutorial/*.png      eight layout drafts, copy set
slides/extras/story-cta.png       9:16 draft
screenshots/README.md             what I'm capturing, and for which slide
```

The drafts were generated from the app's own CSS tokens, so the colours, the
type split and the spacing in them are correct. What they are missing is
craft — real type, real optical spacing, a bird that survives being big.

---

## 9. Two decisions before this goes out — Adarsh, these are yours

**1. "Every Canadian university" is not true yet.** The app is Waterloo-only:
the parser reads Quest specifically, and sign-in gates on `@uwaterloo.ca`
(`src/lib/auth/session.ts`, `src/lib/quest/parse.ts`). The CTA copy above says
what you asked for, and it's written into slides `post-1/03-cta` and
`post-2/08-cta`. Three ways to go:

- Ship it as written, and treat the first non-Waterloo signup as a bug to fix
  fast. Fine if the domain gate is coming down before the post does.
- Say what's true and lose nothing: **"Free. Waterloo now, more schools next."**
  Scarcity reads better than reach to a first-year anyway.
- Ship it as written but only to a national account, and keep a Waterloo-only
  variant for the campus one.

**2. The tutorial is Quest-specific, so it is Waterloo-specific.** Steps 01 and
02 name Quest, List View and its missing mobile page. If this account is
pan-Canadian, that carousel needs one variant per school's portal, and the
generic version can only say "open your school's course portal" — which is
vaguer, and vagueness is what step-by-step posts exist to remove. My suggestion:
keep the tutorial Waterloo-flavoured and let it be obviously written by someone
who goes there.

One smaller thing: `honk-loo.vercel.app` is the live URL per `DEPLOY.md`. It's
long, it has a hyphen, and people will mistype it off a screen. Worth buying a
short domain before this posts.
