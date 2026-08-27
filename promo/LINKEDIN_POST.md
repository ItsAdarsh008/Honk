# LinkedIn post — outline

Instagram sells Honk to students. LinkedIn sells *you* to people who hire — so
this is not the same post with different hashtags. The audience is recruiters,
upper-years, and the Waterloo co-op network, and what they're reading for is
evidence you can ship something real and reason about why it's shaped that way.

## 1. Pick the angle first — everything else follows

| Angle | Reads as | Best if |
|---|---|---|
| **A. The build** *(recommended)* | "I shipped a thing, here's a decision I had to get right" | You want co-op interviews. Gives an interviewer something to ask about. |
| **B. The launch** | "New app for UW students, go try it" | You want signups more than reputation. Weakest on LinkedIn — it's the Instagram post wearing a collar. |
| **C. The problem** | "Frosh week has a coordination problem and here's what I learned building for it" | You want reach beyond people who know what Quest is. Highest ceiling, easiest to get wrong. |

Everything below drafts **A**, because it's the one that survives a stranger
who doesn't care about your app but does care whether you can think.

## 2. Shape

Seven beats, roughly 180–220 words. LinkedIn truncates around 210 characters —
the first two lines are the whole ballgame, everything after them is for people
who already clicked "more".

1. **Hook — two lines, no throat-clearing.** A concrete scene or a number. Never
   "I'm excited to share".
2. **The problem, in one sentence.** Specific to a person, not to a market.
3. **What it does.** One sentence. Resist listing features.
4. **The interesting decision.** This is the beat that does the work — one real
   engineering or design tradeoff, stated with the reasoning. Pick one:
   - *Privacy as a constraint, not a setting.* A class schedule is a
     location-by-hour map of a real person, so rooms are hidden from non-friends
     and gap-matching is mutual-only — enforced in the query layer, with a test
     that fails the build if a new screen queries around it. Looser defaults
     would have grown faster; that was the point of not choosing them.
   - *Parse first, register second.* The payoff has to be visible before signup
     completes, so the parser is a pure function that runs in the browser — your
     schedule never reaches the server until you've seen what was read and
     agreed to save it. A privacy property that fell out of a growth decision.
   - *Sharing isn't the viral mechanic — incompleteness is.* The app is worth
     little with one user, so the invite motivates itself and cold-start gets
     solved by timing rather than by nagging.
5. **Honest status.** One line. What's unproven. This is the highest-trust
   sentence in the post and almost nobody writes it.
6. **Ask.** Something a reader can actually do in ten seconds.
7. **Credit,** if anyone helped.

## 3. Draft

> Two weeks before term I realised the question everyone asks in frosh week —
> "wait, what classes are you in?" — has a database answer.
>
> So I built Honk. You paste your Quest schedule, it reads it, and it shows you
> who's in your lectures and when you and your friends are free at the same time.
>
> The part I spent longest on wasn't the parser. It was deciding what Honk
> refuses to show you.
>
> A class schedule is a location-by-hour map of a real person on a real campus.
> So rooms are never visible to people you haven't added, free-time matching is
> mutual-only, and you're in no class roster until you opt in. All three are
> enforced in the query layer rather than the UI, with a test that fails the
> build if a new screen tries to route around them. Looser defaults would grow
> faster. That's exactly why they're not the defaults.
>
> Status: the overlap engine and the privacy boundary have tests I trust. The
> Quest parser has 59 tests and has never seen a real paste — which makes it the
> riskiest code I've written this year.
>
> If you're at Waterloo and you'd paste your schedule into it, I want your parse
> failures more than your compliments. Link in the comments.

**Word count:** ~200. Trim beat 4 before you trim beat 5.

## 4. Line notes

- **Cut every adverb in the hook.** "Actually", "genuinely", "really" — all of
  them weaken the sentence they're propping up.
- **"Link in the comments" is not a style choice.** LinkedIn suppresses reach on
  posts with an outbound link in the body. Post the URL as your own first
  comment within a minute of publishing.
- **Keep the failure admission specific.** "It might have bugs" is noise. "59
  tests and has never seen a real paste" is a fact someone can respond to, and
  responses are the only thing that makes a post travel.
- **No emoji bullets, no 🚀, no one-sentence-per-line poetry formatting.** The
  paragraph breaks above are the whole formatting budget.
- **Don't call it a "passion project" or "side hustle".** Call it what it is.

## 5. What to attach

One image beats a carousel here — LinkedIn's document carousel is for decks, and
this isn't a deck.

- **First choice:** `slides/post-1-what-it-does/01-your-classes.png`. It shows
  the product in one glance and needs no caption.
- **Alternative:** a real screenshot of the "When you're both free" screen once
  you've captured it (`screenshots/README.md`). Real UI outperforms designed
  marketing images on LinkedIn — the audience is suspicious of polish.
- **Not** the profile picture, and **not** the CTA slide. A goose on a cream
  square means nothing to someone who's never heard of this.

## 6. Before you post

- **Say Waterloo, not Canada.** The Instagram CTA carries "every Canadian
  university" as an ambition; on LinkedIn, where people will check, claiming
  reach you don't have is the one mistake that's expensive. Waterloo-only is a
  *sharper* story anyway — it's a bet on a specific campus at a specific moment.
- **Screenshot has no real names in it.** Yours only.
- **Have the parser bug channel ready** before you ask for parse failures, or
  you'll get five and lose them.
- **Reply to every comment in the first two hours.** That window decides the
  post's reach more than anything in the copy.

## 7. Tagging and tags

Tag people, not companies — a tagged person who comments lifts the post, a
tagged company does nothing. Three to five hashtags at the end, plain and
unclever: `#Waterloo #UWaterloo #BuildInPublic #SideProject #TypeScript`.

Best time: Tuesday–Thursday, 8–10am ET. Avoid Friday afternoon and the whole
weekend.

## 8. If the post does well

The follow-up is already written for you: post the parser's first real-world
failure and what it taught you. "Here's what broke when 40 people used it" is a
better post than the launch, and almost nobody writes it because it costs
something to admit.
