# promo

Launch assets for Honk's Instagram account. Everything here is either a brand
file the designer needs or a **reference layout** carrying the copy — none of it
is final art.

**Send `CLAUDE_DESIGN_PROMPT.md` plus this folder.** The prompt is written to be
pasted straight into Claude Design; §9 of it holds two copy decisions that are
yours to make first.

## What's here

```
CLAUDE_DESIGN_PROMPT.md            ← the brief. Start here.
LINKEDIN_POST.md                   ← outline + draft for the LinkedIn launch post
screenshots/README.md              ← what to capture, and for which slide

brand/
  honk-goose.svg/.png              the mark, exactly as the app ships it
  honk-goose-display.svg           same geometry, outline thinned for large use
  honk-goose-cream-tile.svg/.png   the app-icon treatment
  honk-lockup.svg/.png             goose + wordmark
  palette.svg/.png                 every token as a swatch, with hex

profile-picture/
  honk-pfp-cream.png               option A — clay bird, cream ground
  honk-pfp-clay.png                option B — cream bird, clay ground
  honk-pfp-safe-area.png           Instagram's circle crop + a keep-inside guide
  honk-pfp-size-test.png           the mark at 176 → 32px. The test to beat.

slides/post-1-what-it-does/        3 slides, 1080×1350
  01-your-classes                  what it does
  02-different-programs            needs the real screenshot
  02-different-programs-ALT-mocked stand-in, shows what that screen contains
  03-cta                           sign up

slides/post-2-tutorial/            8 slides, 1080×1350
  01-cover … 08-cta

slides/extras/story-cta            1080×1920
```

## Regenerating

```bash
node tools/build-promo.js
```

Rewrites every file above from `tools/build-promo.js`. The palette, the goose
geometry and the type split in that script are copied from
`src/app/globals.css` and `src/lib/goose.ts` — **if the app's tokens change,
change them there and re-run**, don't hand-edit the SVGs.

SVGs are the source; PNGs are rasterised at 2× and resampled to exact platform
pixel sizes, so they're ready to upload as-is.

## What the drafts get right, and what they don't

Right: the palette, the sans/mono split (mono is only ever for machine-generated
fields — codes, rooms, times, counts), hairlines instead of shadows, the
84px margins, the copy.

Not right: the type is whatever the render host had, optical spacing is
arithmetic rather than judgement, and the goose is a favicon that has been
scaled up. That last one is a real problem for the profile picture and the
brief says so.
