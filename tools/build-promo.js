/**
 * Generates everything under /promo.
 *
 * These are reference assets, not final art: the brand marks are exact (they
 * are the same path data the app ships), the slide layouts are drafts that
 * carry the copy, the grid and the type scale so a designer starts from the
 * real thing rather than from a description of it.
 *
 * Run: node tools/build-promo.js
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const OUT = path.join(__dirname, "..", "promo");

/* ------------------------------------------------------------------ *
 * Tokens — copied verbatim from src/app/globals.css and src/lib/goose.ts.
 * ------------------------------------------------------------------ */

const T = {
  cream: "#FDFBF6",
  surface: "#FFFFFF",
  sunken: "#F7F4ED",
  border: "#EAE5DA",
  borderStrong: "#DDD6C7",
  ink: "#33322C",
  inkSoft: "#75726A",
  inkFaint: "#A5A096",
  clay: "#C97B4A",
  clayHover: "#B56A3C",
  claySoft: "#F7EBE2",
  course1: "#B5CDAA",
  course2: "#F3CBA5",
  course3: "#AFC8DE",
  course4: "#DCBBD1",
  course5: "#EDDDA4",
  course6: "#C7BADD",
};

const SANS = "Segoe UI, -apple-system, Helvetica Neue, Arial, sans-serif";
const MONO = "Consolas, SF Mono, Menlo, Liberation Mono, monospace";

/** Where the app actually lives, per DEPLOY.md. */
const SITE = "honk-loo.vercel.app";

const GOOSE = {
  tail: "M1.6 16.4 6.0 18.0 4.4 21.4Z",
  body:
    "M4.6 18.6C7.2 15.8 11.0 14.4 14.6 14.9C17.4 15.3 19.4 16.8 20.4 19.0C21.4 21.3 21.0 24.0 19.3 25.8C17.4 27.8 14.2 28.7 11.0 28.3C7.6 27.9 5.0 25.9 3.9 23.0C3.3 21.4 3.6 19.8 4.6 18.6Z",
  belly:
    "M5.4 22.6C7.6 25.0 11.2 26.4 14.8 26.0C17.2 25.7 19.0 24.6 20.0 23.0C20.4 24.6 19.9 26.3 18.6 27.4C16.7 29.0 13.6 29.6 10.6 29.1C7.4 28.6 5.0 26.6 4.2 24.0C4.4 23.4 4.8 22.9 5.4 22.6Z",
  neck: "M14.0 16.6C13.4 12.6 15.2 9.0 18.6 7.2",
  neckWidth: 4.6,
  head: { cx: 22.4, cy: 6.6, rx: 4.1, ry: 3.7 },
  beak: "M25.9 5.2 31.3 6.9 25.9 8.6Z",
  cheek:
    "M21.0 3.6C22.2 4.6 22.6 6.4 22.2 8.2C22.0 9.2 21.5 9.9 20.9 10.2C19.7 8.4 19.6 5.6 21.0 3.6Z",
  outline: 1.05,
};

const GOOSE_LIGHT = {
  body: T.clay,
  belly: "#E0A878",
  head: T.ink,
  cheek: T.cream,
  beak: T.ink,
  line: T.ink,
};

/** Cream bird on a clay ground, for the alternate profile picture. */
const GOOSE_INVERSE = {
  body: T.cream,
  belly: "#F1DFCC",
  head: "#2B2A25",
  cheek: T.clay,
  beak: "#2B2A25",
  line: "#2B2A25",
};

/**
 * The mark, drawn on its native 32-unit grid and scaled into place. Emitting
 * the same path data everywhere is the point — the slide lockups are literally
 * the app's favicon.
 *
 * `stroke` is in the 32-unit grid's own terms. The app's 1.05 is tuned for a
 * 24–48px mark; left alone at 600px it thickens into a cartoon outline, so
 * large renders pass a smaller value to keep the edge reading as a hairline.
 */
function goose({ x, y, size, palette = GOOSE_LIGHT, stroke = GOOSE.outline }) {
  const s = size / 32;
  const p = palette;
  return `<g transform="translate(${r(x)} ${r(y)}) scale(${r(s, 4)})">
    <g stroke="${p.line}" stroke-width="${stroke}" stroke-linejoin="round" stroke-linecap="round" fill="none">
      <path d="${GOOSE.tail}" fill="${p.body}"/>
      <path d="${GOOSE.body}" fill="${p.body}"/>
      <path d="${GOOSE.belly}" fill="${p.belly}"/>
      <path d="${GOOSE.neck}" stroke="${p.head}" stroke-width="${GOOSE.neckWidth}"/>
      <ellipse cx="${GOOSE.head.cx}" cy="${GOOSE.head.cy}" rx="${GOOSE.head.rx}" ry="${GOOSE.head.ry}" fill="${p.head}" stroke="none"/>
      <path d="${GOOSE.beak}" fill="${p.beak}" stroke="none"/>
      <path d="${GOOSE.cheek}" fill="${p.cheek}" stroke="none"/>
    </g>
  </g>`;
}

/** Keeps a large render's outline visually equal to the app's hairline. */
const hairline = (size) => Math.max(0.28, 1.05 * (34 / size));

/* ------------------------------------------------------------------ *
 * Text helpers. SVG does not wrap, so lines are measured and broken here.
 * ------------------------------------------------------------------ */

const r = (n, d = 2) => Number(n.toFixed(d));
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function wrap(text, fontSize, maxWidth, ratio = 0.512) {
  const per = fontSize * ratio;
  const max = Math.max(1, Math.floor(maxWidth / per));
  const lines = [];
  for (const paragraph of String(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > max && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

function block({
  text,
  x,
  y,
  size,
  lineHeight,
  fill = T.ink,
  weight = 400,
  family = SANS,
  maxWidth,
  tracking = 0,
  ratio,
  anchor = "start",
}) {
  const lines = maxWidth ? wrap(text, size, maxWidth, ratio) : [String(text)];
  const lh = lineHeight ?? size * 1.34;
  const spans = lines
    .map(
      (line, i) =>
        `<tspan x="${r(x)}" y="${r(y + i * lh)}">${esc(line)}</tspan>`,
    )
    .join("");
  return {
    svg: `<text font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" letter-spacing="${tracking}" text-anchor="${anchor}" xml:space="preserve">${spans}</text>`,
    height: lines.length * lh,
    bottom: y + (lines.length - 1) * lh,
    lines: lines.length,
  };
}

function label(text, x, y, { fill = T.inkFaint, size = 22 } = {}) {
  return block({
    text: String(text).toUpperCase(),
    x,
    y,
    size,
    weight: 500,
    family: MONO,
    fill,
    tracking: size * 0.09,
  }).svg;
}

function chip(text, x, y, { accent = false, size = 22, pad = 16 } = {}) {
  const w = String(text).length * size * 0.58 + pad * 2;
  const h = size * 1.95;
  return {
    w,
    h,
    svg: `<g>
      <rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="10"
        fill="${accent ? T.claySoft : T.sunken}" stroke="${accent ? "none" : T.border}" stroke-width="2"/>
      <text x="${r(x + w / 2)}" y="${r(y + h / 2 + size * 0.36)}" text-anchor="middle"
        font-family="${MONO}" font-size="${size}" fill="${accent ? T.clay : T.inkSoft}"
        letter-spacing="${size * 0.03}">${esc(text)}</text>
    </g>`,
  };
}

/* ------------------------------------------------------------------ *
 * The slide shell — identical on every slide, which is what makes a
 * carousel read as one object rather than eight posters.
 * ------------------------------------------------------------------ */

const W = 1080;
const H = 1350;
const M = 84; // margin

function shell({ index, total, footer = SITE, ground = T.cream }) {
  const head = `
    ${goose({ x: M, y: 78, size: 46 })}
    <text x="${M + 62}" y="${78 + 34}" font-family="${SANS}" font-size="34" font-weight="600"
      fill="${T.ink}" letter-spacing="-0.6">Honk</text>
    ${
      index
        ? `<text x="${W - M}" y="${78 + 32}" text-anchor="end" font-family="${MONO}"
            font-size="24" fill="${T.inkFaint}" letter-spacing="1.4">${String(index).padStart(2, "0")} / ${String(total).padStart(2, "0")}</text>`
        : ""
    }`;

  const foot = `
    <rect x="${M}" y="${H - 118}" width="${W - M * 2}" height="2" fill="${T.border}"/>
    ${
      footer
        ? `<text x="${M}" y="${H - 74}" font-family="${MONO}" font-size="24" fill="${T.inkFaint}"
            letter-spacing="1.2">${esc(footer)}</text>`
        : ""
    }`;

  return { ground: `<rect width="${W}" height="${H}" fill="${ground}"/>`, head, foot };
}

function svgDoc(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

/* ------------------------------------------------------------------ *
 * Reusable art: the week, drawn the way the app draws it — pastel blocks
 * with dark ink, hairline edges, and the gap between classes measured
 * rather than left blank.
 * ------------------------------------------------------------------ */

function weekCard({ x, y, w, h, highlight = null, showGaps = true }) {
  const days = ["MON", "TUE", "WED", "THU", "FRI"];
  const padX = 26;
  const gutter = 74; // the hour column, as in the app
  const padTop = 68;
  const padBottom = 26;
  const colGap = 12;
  const colW =
    (w - padX * 2 - gutter - colGap * (days.length - 1)) / days.length;
  const innerH = h - padTop - padBottom;

  // Minutes past 08:30. The window is deliberately tight so the week fills
  // the card — a half-empty timetable reads as "nothing happens here".
  const dayStart = 510;
  const span = 420; // 08:30 → 15:30
  const blocks = [
    { d: 0, s: 630, e: 680, c: T.course1, code: "CS 135", meta: "MC 4020" },
    { d: 0, s: 810, e: 870, c: T.course3, code: "MATH 135", meta: "MC 4045" },
    { d: 1, s: 570, e: 650, c: T.course2, code: "BU 111", meta: "BA 201" },
    { d: 1, s: 780, e: 850, c: T.course4, code: "ECON 101", meta: "RCH 103" },
    { d: 2, s: 630, e: 680, c: T.course1, code: "CS 135", meta: "MC 4020" },
    { d: 2, s: 780, e: 860, c: T.course4, code: "ECON 101", meta: "RCH 103" },
    { d: 3, s: 600, e: 680, c: T.course5, code: "SPCOM", meta: "DWE 3522" },
    { d: 3, s: 810, e: 870, c: T.course3, code: "MATH 135", meta: "MC 4045" },
    { d: 4, s: 630, e: 680, c: T.course1, code: "CS 135", meta: "MC 4020" },
    { d: 4, s: 800, e: 880, c: T.course6, code: "MATH 137", meta: "MC 2054" },
  ];

  const px = (min) => padTop + ((min - dayStart) / span) * innerH;
  const colX = (d) => x + padX + gutter + d * (colW + colGap);
  const parts = [];

  parts.push(
    `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="30" fill="${T.surface}" stroke="${T.border}" stroke-width="2"/>`,
  );
  parts.push(
    `<rect x="${r(x + padX)}" y="${r(y + padTop - 22)}" width="${r(w - padX * 2)}" height="2" fill="${T.border}"/>`,
  );

  days.forEach((d, i) => {
    parts.push(
      `<text x="${r(colX(i) + colW / 2)}" y="${r(y + 44)}" text-anchor="middle" font-family="${MONO}"
        font-size="20" fill="${T.inkFaint}" letter-spacing="1.6">${d}</text>`,
    );
  });

  // Hour rules and the gutter labels.
  for (let m = 540; m <= dayStart + span; m += 60) {
    const ry = y + px(m);
    parts.push(
      `<rect x="${r(colX(0))}" y="${r(ry)}" width="${r(w - padX - gutter - (colX(0) - x))}" height="1.5"
        fill="${T.border}" opacity="0.7"/>`,
    );
    const hour = Math.floor(m / 60);
    const stamp = `${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? "PM" : "AM"}`;
    parts.push(
      `<text x="${r(x + padX + gutter - 16)}" y="${r(ry + 7)}" text-anchor="end" font-family="${MONO}"
        font-size="18" fill="${T.inkFaint}">${stamp}</text>`,
    );
  }

  for (const b of blocks) {
    const bx = colX(b.d);
    const by = y + px(b.s);
    const bh = px(b.e) - px(b.s);
    const isHi = highlight && b.code === highlight;
    parts.push(
      `<rect x="${r(bx)}" y="${r(by)}" width="${r(colW)}" height="${r(bh)}" rx="14"
        fill="${b.c}" stroke="${isHi ? T.ink : "rgba(0,0,0,0.07)"}" stroke-width="${isHi ? 3 : 2}"/>`,
    );
    parts.push(
      `<text x="${r(bx + 12)}" y="${r(by + 27)}" font-family="${MONO}" font-size="18" font-weight="600"
        fill="${T.ink}" letter-spacing="-0.3">${esc(b.code)}</text>`,
    );
    if (bh > 58) {
      parts.push(
        `<text x="${r(bx + 12)}" y="${r(by + 50)}" font-family="${MONO}" font-size="16"
          fill="${T.ink}" opacity="0.66">${esc(b.meta)}</text>`,
      );
    }
  }

  if (showGaps) {
    // Wednesday's gap, measured. The app draws free time rather than leaving
    // it blank, and that is the detail worth putting in front of people.
    const gapTop = y + px(680);
    const gapBot = y + px(780);
    const gx = colX(2) + colW / 2;
    parts.push(
      `<line x1="${r(gx)}" y1="${r(gapTop + 10)}" x2="${r(gx)}" y2="${r(gapBot - 10)}"
        stroke="${T.borderStrong}" stroke-width="2"/>`,
    );
    const mid = (gapTop + gapBot) / 2;
    parts.push(
      `<rect x="${r(gx - 44)}" y="${r(mid - 17)}" width="88" height="34" rx="8" fill="${T.surface}"/>`,
    );
    parts.push(
      `<text x="${r(gx)}" y="${r(mid + 7)}" text-anchor="middle" font-family="${MONO}" font-size="19"
        fill="${T.inkFaint}">1h 40m</text>`,
    );
  }

  return parts.join("\n");
}

/** The "When you're both free" list, as the profile screen renders it. */
function sharedGapsCard({ x, y, w, rows, dim = false }) {
  const rowH = 84;
  const h = 74 + rows.length * rowH;
  const parts = [
    `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="30"
      fill="${T.surface}" stroke="${T.border}" stroke-width="2" opacity="${dim ? 0.55 : 1}"/>`,
  ];
  parts.push(
    `<text x="${r(x + 34)}" y="${r(y + 46)}" font-family="${MONO}" font-size="21"
      fill="${T.inkFaint}" letter-spacing="1.8" opacity="${dim ? 0.55 : 1}">WHEN YOU'RE BOTH FREE</text>`,
  );
  rows.forEach((row, i) => {
    const ry = y + 74 + i * rowH;
    parts.push(
      `<rect x="${r(x + 34)}" y="${r(ry)}" width="${r(w - 68)}" height="2" fill="${T.border}" opacity="${dim ? 0.55 : 1}"/>`,
    );
    parts.push(
      `<text x="${r(x + 34)}" y="${r(ry + 52)}" font-family="${MONO}" font-size="24"
        fill="${row.today ? T.clay : T.inkFaint}" opacity="${dim ? 0.55 : 1}">${esc(row.day)}</text>`,
    );
    parts.push(
      `<text x="${r(x + 250)}" y="${r(ry + 52)}" font-family="${MONO}" font-size="26"
        fill="${T.ink}" opacity="${dim ? 0.55 : 1}">${esc(row.range)}</text>`,
    );
    parts.push(
      `<text x="${r(x + w - 34)}" y="${r(ry + 52)}" text-anchor="end" font-family="${MONO}" font-size="24"
        fill="${T.inkFaint}" opacity="${dim ? 0.55 : 1}">${esc(row.dur)}</text>`,
    );
  });
  return { svg: parts.join("\n"), h };
}

/* ------------------------------------------------------------------ *
 * Slides
 * ------------------------------------------------------------------ */

function slide({ index, total, kicker, headline, body, art, footer, note }) {
  const s = shell({ index, total, footer });
  const parts = [s.ground, s.head];

  let y = 250;
  if (kicker) {
    parts.push(label(kicker, M, y, { fill: T.clay, size: 24 }));
    y += 54;
  }

  const h = block({
    text: headline,
    x: M,
    y: y + 54,
    size: 68,
    lineHeight: 82,
    weight: 600,
    maxWidth: W - M * 2,
    tracking: -1.6,
    ratio: 0.5,
  });
  parts.push(h.svg);
  y = h.bottom + 62;

  if (body) {
    const b = block({
      text: body,
      x: M,
      y,
      size: 30,
      lineHeight: 46,
      weight: 400,
      fill: T.inkSoft,
      maxWidth: W - M * 2,
      ratio: 0.5,
    });
    parts.push(b.svg);
    y = b.bottom + 60;
  }

  if (art) parts.push(art(y));
  if (note) {
    parts.push(
      block({
        text: note,
        x: M,
        y: H - 168,
        size: 24,
        weight: 400,
        fill: T.inkFaint,
        maxWidth: W - M * 2,
        ratio: 0.5,
      }).svg,
    );
  }
  parts.push(s.foot);
  return svgDoc(W, H, parts.join("\n"));
}

/* ------------------------------------------------------------------ *
 * Write everything
 * ------------------------------------------------------------------ */

const written = [];

function ensure(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Rasterise at 2× and come back down: text stays crisp, and the PNG lands at
 * exactly the pixel size the platform wants rather than a 4500px monster
 * nobody can attach to a message.
 */
async function emit(relPath, svg, { png = true } = {}) {
  const full = path.join(OUT, relPath);
  ensure(path.dirname(full));
  fs.writeFileSync(full, svg);
  written.push(relPath);
  if (png) {
    const pngPath = full.replace(/\.svg$/, ".png");
    const nativeWidth = Number(svg.match(/width="(\d+)"/)[1]);
    const buf = await sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
    const out = await sharp(buf)
      .resize({ width: nativeWidth })
      .png({ compressionLevel: 9 })
      .toFile(pngPath);
    written.push(`${relPath.replace(/\.svg$/, ".png")}  ${out.width}×${out.height}`);
  }
}

async function build() {
  /* ---------- brand marks ---------- */

  // The mark exactly as the app ships it — for tracing, not for enlarging.
  await emit(
    "brand/honk-goose.svg",
    svgDoc(512, 512, goose({ x: 26, y: 26, size: 460 })),
    { png: true },
  );

  // The same geometry with the outline optically corrected for large use.
  await emit(
    "brand/honk-goose-display.svg",
    svgDoc(512, 512, goose({ x: 26, y: 26, size: 460, stroke: hairline(460) })),
  );

  await emit(
    "brand/honk-goose-cream-tile.svg",
    svgDoc(
      512,
      512,
      `<rect width="512" height="512" rx="112" fill="${T.cream}"/>` +
        goose({ x: 62, y: 62, size: 388 }),
    ),
  );

  await emit(
    "brand/honk-lockup.svg",
    svgDoc(
      760,
      200,
      `<rect width="760" height="200" fill="${T.cream}"/>` +
        goose({ x: 60, y: 62, size: 84 }) +
        `<text x="172" y="130" font-family="${SANS}" font-size="86" font-weight="600"
          fill="${T.ink}" letter-spacing="-2.4">Honk</text>`,
    ),
  );

  /* ---------- palette sheet ---------- */

  const swatches = [
    ["cream", T.cream, "page ground"],
    ["surface", T.surface, "cards"],
    ["sunken", T.sunken, "chips, inputs"],
    ["border", T.border, "hairlines"],
    ["ink", T.ink, "all body text"],
    ["ink-soft", T.inkSoft, "secondary text"],
    ["ink-faint", T.inkFaint, "mono metadata"],
    ["clay", T.clay, "the only accent"],
    ["clay-soft", T.claySoft, "accent ground"],
    ["course-1", T.course1, "class block"],
    ["course-2", T.course2, "class block"],
    ["course-3", T.course3, "class block"],
    ["course-4", T.course4, "class block"],
    ["course-5", T.course5, "class block"],
    ["course-6", T.course6, "class block"],
  ];

  const pw = 1080;
  const ph = 1180;
  const cols = 3;
  const cellW = (pw - 80 * 2 - 30 * (cols - 1)) / cols;
  const cellH = 176;
  const sw = swatches.map((s, i) => {
    const cx = 80 + (i % cols) * (cellW + 30);
    const cy = 250 + Math.floor(i / cols) * (cellH + 26);
    return `<g>
      <rect x="${r(cx)}" y="${r(cy)}" width="${r(cellW)}" height="96" rx="16"
        fill="${s[1]}" stroke="${T.border}" stroke-width="2"/>
      <text x="${r(cx)}" y="${r(cy + 128)}" font-family="${MONO}" font-size="22" fill="${T.ink}">${s[1]}</text>
      <text x="${r(cx)}" y="${r(cy + 156)}" font-family="${MONO}" font-size="19" fill="${T.inkFaint}">${esc(s[0])} · ${esc(s[2])}</text>
    </g>`;
  });

  await emit(
    "brand/palette.svg",
    svgDoc(
      pw,
      ph,
      `<rect width="${pw}" height="${ph}" fill="${T.cream}"/>` +
        goose({ x: 80, y: 74, size: 46 }) +
        `<text x="142" y="112" font-family="${SANS}" font-size="34" font-weight="600" fill="${T.ink}" letter-spacing="-0.6">Honk — palette</text>` +
        `<text x="80" y="186" font-family="${SANS}" font-size="26" fill="${T.inkSoft}">Warm cream, muted pastels, one clay accent. Nothing here is allowed to be loud.</text>` +
        sw.join("\n"),
    ),
  );

  /* ---------- profile picture ---------- */

  const pfpSize = 1080;
  // Centred on the bird's visual mass, which sits lower than its bounding box:
  // the body is the weight, the beak is just a spike of air.
  const pfpG = { x: 268, y: 262, size: 546, stroke: hairline(546) };

  await emit(
    "profile-picture/honk-pfp-cream.svg",
    svgDoc(
      pfpSize,
      pfpSize,
      `<rect width="${pfpSize}" height="${pfpSize}" fill="${T.cream}"/>` +
        goose(pfpG),
    ),
  );

  await emit(
    "profile-picture/honk-pfp-clay.svg",
    svgDoc(
      pfpSize,
      pfpSize,
      `<rect width="${pfpSize}" height="${pfpSize}" fill="${T.clay}"/>` +
        goose({ ...pfpG, palette: GOOSE_INVERSE }),
    ),
  );

  await emit(
    "profile-picture/honk-pfp-safe-area.svg",
    svgDoc(
      pfpSize,
      pfpSize,
      `<rect width="${pfpSize}" height="${pfpSize}" fill="${T.cream}"/>` +
        goose(pfpG) +
        `<circle cx="540" cy="540" r="538" fill="none" stroke="${T.clay}" stroke-width="4" stroke-dasharray="18 14"/>` +
        `<circle cx="540" cy="540" r="420" fill="none" stroke="${T.inkFaint}" stroke-width="3" stroke-dasharray="10 12"/>` +
        `<text x="540" y="1046" text-anchor="middle" font-family="${MONO}" font-size="23" fill="${T.inkFaint}">outer = Instagram's circle crop · inner = keep the bird inside this</text>`,
    ),
  );

  /**
   * The same mark at 44px, repeated. Instagram shows a profile picture at
   * roughly 110px on a phone and 32px in a comment thread, so this sheet is
   * the only honest test of whether a profile picture works.
   */
  await emit(
    "profile-picture/honk-pfp-size-test.svg",
    (() => {
      const w = 1080;
      const h = 480;
      const sizes = [176, 110, 64, 44, 32];
      let cx = 96;
      const rowY = 190;
      const marks = sizes
        .map((s) => {
          const g =
            `<circle cx="${r(cx + s / 2)}" cy="${r(rowY + s / 2)}" r="${r(s / 2)}" fill="${T.cream}" stroke="${T.border}" stroke-width="2"/>` +
            `<g clip-path="url(#c${s})">${goose({ x: cx + s * 0.11, y: rowY + s * 0.08, size: s * 0.78, stroke: hairline(s * 0.78) })}</g>` +
            `<text x="${r(cx + s / 2)}" y="${r(rowY + 240)}" text-anchor="middle" font-family="${MONO}" font-size="20" fill="${T.inkFaint}">${s}px</text>`;
          cx += s + 78;
          return g;
        })
        .join("\n");
      const clips = sizes
        .map((s, i) => {
          let ox = 96;
          for (let j = 0; j < i; j += 1) ox += sizes[j] + 78;
          return `<clipPath id="c${s}"><circle cx="${r(ox + s / 2)}" cy="${r(rowY + s / 2)}" r="${r(s / 2)}"/></clipPath>`;
        })
        .join("");
      return svgDoc(
        w,
        h,
        `<defs>${clips}</defs><rect width="${w}" height="${h}" fill="${T.surface}"/>` +
          `<text x="96" y="96" font-family="${MONO}" font-size="22" fill="${T.inkFaint}" letter-spacing="1.8">SIZE TEST — THE BIRD HAS TO SURVIVE THE RIGHT-HAND END</text>` +
          marks,
      );
    })(),
  );

  /* ---------- POST 1 — what Honk does ---------- */

  const P1 = "slides/post-1-what-it-does";

  await emit(
    `${P1}/01-your-classes.svg`,
    slide({
      index: 1,
      total: 3,
      kicker: "What it does",
      headline: "See who is actually in your classes.",
      body:
        "Paste your schedule once. Honk lines it up against everyone else's and shows you who shares your lectures, tutorials and labs — the people in your program you would otherwise take a month to meet.",
      art: (y) => weekCard({ x: M, y, w: W - M * 2, h: H - y - 190, highlight: "CS 135" }),
    }),
  );

  await emit(
    `${P1}/02-different-programs.svg`,
    slide({
      index: 2,
      total: 3,
      kicker: "Different programs",
      headline: "Not in the same classes? Add them anyway.",
      body:
        "Your friends in other faculties never turn up in your lectures. Add each other and Honk works out the gaps you both have free — every overlapping window, half an hour or longer.",
      art: (y) => {
        const w = W - M * 2;
        const h = H - y - 190;
        return `<g>
          <rect x="${M}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="30"
            fill="${T.sunken}" stroke="${T.borderStrong}" stroke-width="3" stroke-dasharray="14 12"/>
          <text x="${W / 2}" y="${r(y + h / 2 - 34)}" text-anchor="middle" font-family="${MONO}"
            font-size="26" fill="${T.inkSoft}" letter-spacing="1.6">SCREENSHOT GOES HERE</text>
          <text x="${W / 2}" y="${r(y + h / 2 + 12)}" text-anchor="middle" font-family="${SANS}"
            font-size="26" fill="${T.inkFaint}">Adarsh is supplying a real "When you're both free" screen.</text>
          <text x="${W / 2}" y="${r(y + h / 2 + 54)}" text-anchor="middle" font-family="${MONO}"
            font-size="22" fill="${T.inkFaint}">promo/screenshots/shared-gaps.png</text>
        </g>`;
      },
    }),
  );

  // The same slide with stand-in content, so the intent of the screenshot is legible.
  await emit(
    `${P1}/02-different-programs-ALT-mocked.svg`,
    slide({
      index: 2,
      total: 3,
      kicker: "Different programs",
      headline: "Not in the same classes? Add them anyway.",
      body:
        "Your friends in other faculties never turn up in your lectures. Add each other and Honk works out the gaps you both have free — every overlapping window, half an hour or longer.",
      art: (y) =>
        sharedGapsCard({
          x: M,
          y,
          w: W - M * 2,
          rows: [
            { day: "Monday", range: "11:20 – 13:00", dur: "1h 40m" },
            { day: "Wednesday", range: "14:20 – 16:00", dur: "1h 40m", today: true },
            { day: "Thursday", range: "9:30 – 11:00", dur: "1h 30m" },
            { day: "Friday", range: "12:20 – 14:30", dur: "2h 10m" },
          ],
        }).svg,
      note: "Reference only — the slide above takes the real screenshot.",
    }),
  );

  await emit(
    `${P1}/03-cta.svg`,
    slide({
      index: 3,
      total: 3,
      kicker: "Sign up",
      headline: "Get on Honk.",
      footer: "",
      body:
        "Paste your schedule, add the people you already know, and stop sending \"when are you free\" into four different group chats.",
      art: (y) => {
        const btnY = y + 60;
        return `<g>
          <rect x="${M}" y="${r(btnY)}" width="${r(W - M * 2)}" height="112" rx="24" fill="${T.clay}"/>
          <text x="${W / 2}" y="${r(btnY + 72)}" text-anchor="middle" font-family="${SANS}"
            font-size="38" font-weight="600" fill="#FFFDFA">honk-loo.vercel.app</text>
          <text x="${W / 2}" y="${r(btnY + 186)}" text-anchor="middle" font-family="${SANS}"
            font-size="34" font-weight="600" fill="${T.ink}">Free, and open to every Canadian university.</text>
          <text x="${W / 2}" y="${r(btnY + 238)}" text-anchor="middle" font-family="${SANS}"
            font-size="28" fill="${T.inkSoft}">School email, a schedule, about a minute.</text>
          ${goose({ x: W / 2 - 84, y: btnY + 316, size: 168, stroke: hairline(168) })}
        </g>`;
      },
    }),
  );

  /* ---------- POST 2 — tutorial ---------- */

  const P2 = "slides/post-2-tutorial";
  const steps = [
    {
      kicker: "Step 01",
      headline: "Open Quest on a laptop.",
      body:
        "Enroll → My Class Schedule, then switch to List View. Quest's mobile site has no schedule page, so this one step needs a real keyboard. Everything after it works fine on your phone.",
    },
    {
      kicker: "Step 02",
      headline: "Select the whole page and copy it.",
      body:
        "Ctrl+A, then Ctrl+C. Headings, nav junk and all — Honk reads the useful bits and throws the rest away. Do not tidy it up first.",
    },
    {
      kicker: "Step 03",
      headline: "Paste it into Honk.",
      body:
        "Your week appears as you paste. It is read in your browser, so nothing has been sent anywhere yet. Check the rooms and times look right, then save.",
    },
    {
      kicker: "Step 04",
      headline: "Sign in with your school email.",
      body:
        "Then a five-digit PIN you make up on the spot — deliberately not your school password, so there is nothing worth reusing. A six-digit code lands in your inbox. Pick a name and a handle and you are in.",
    },
    {
      kicker: "Step 05",
      headline: "Send your link to three people.",
      body:
        "Honk is worth nothing with one user. Shared classes appear on their own; shared free time only shows up once you have both added each other.",
    },
    {
      kicker: "Step 06",
      headline: "Then check who is free right now.",
      body:
        "Between classes, open Honk instead of the group chat. It already knows who has a gap where you have a gap, and how long it lasts.",
    },
  ];

  await emit(
    `${P2}/01-cover.svg`,
    slide({
      index: 1,
      total: 8,
      kicker: "Tutorial",
      headline: "How to get on Honk.",
      body: "About a minute. One step needs a laptop; the rest is your phone.",
      art: (y) => {
        const items = [
          "01  Open Quest, List View",
          "02  Select all, copy",
          "03  Paste into Honk",
          "04  School email + PIN",
          "05  Send your link",
          "06  Find a shared gap",
        ];
        return items
          .map((t, i) => {
            const iy = y + 30 + i * 88;
            return `<g>
              <rect x="${M}" y="${r(iy)}" width="${r(W - M * 2)}" height="70" rx="18"
                fill="${T.surface}" stroke="${T.border}" stroke-width="2"/>
              <text x="${M + 30}" y="${r(iy + 46)}" font-family="${MONO}" font-size="27"
                fill="${T.ink}" letter-spacing="0.4">${esc(t)}</text>
            </g>`;
          })
          .join("\n");
      },
    }),
  );

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const n = i + 2;
    await emit(
      `${P2}/${String(n).padStart(2, "0")}-${step.kicker.toLowerCase().replace(/\s+/g, "-")}.svg`,
      slide({
        index: n,
        total: 8,
        kicker: step.kicker,
        headline: step.headline,
        body: step.body,
        art: (y) => {
          const h = H - y - 190;
          return `<g>
            <rect x="${M}" y="${r(y)}" width="${r(W - M * 2)}" height="${r(h)}" rx="30"
              fill="${T.sunken}" stroke="${T.borderStrong}" stroke-width="3" stroke-dasharray="14 12"/>
            <text x="${W / 2}" y="${r(y + h / 2 - 16)}" text-anchor="middle" font-family="${MONO}"
              font-size="26" fill="${T.inkSoft}" letter-spacing="1.6">SCREENSHOT ${String(n - 1).padStart(2, "0")}</text>
            <text x="${W / 2}" y="${r(y + h / 2 + 30)}" text-anchor="middle" font-family="${SANS}"
              font-size="25" fill="${T.inkFaint}">see promo/screenshots/README.md for what to capture</text>
          </g>`;
        },
      }),
    );
  }

  await emit(
    `${P2}/08-cta.svg`,
    slide({
      index: 8,
      total: 8,
      kicker: "That's it",
      headline: "Go paste your schedule.",
      footer: "",
      body: "Honk is free, and open to every Canadian university.",
      art: (y) => {
        const btnY = y + 60;
        return `<g>
          <rect x="${M}" y="${r(btnY)}" width="${r(W - M * 2)}" height="112" rx="24" fill="${T.clay}"/>
          <text x="${W / 2}" y="${r(btnY + 72)}" text-anchor="middle" font-family="${SANS}"
            font-size="38" font-weight="600" fill="#FFFDFA">honk-loo.vercel.app</text>
          ${goose({ x: W / 2 - 100, y: btnY + 260, size: 200, stroke: hairline(200) })}
        </g>`;
      },
    }),
  );

  /* ---------- story / 1:1 crop of the CTA, useful for reposting ---------- */

  await emit(
    "slides/extras/story-cta.svg",
    (() => {
      const w = 1080;
      const h = 1920;
      return svgDoc(
        w,
        h,
        `<rect width="${w}" height="${h}" fill="${T.cream}"/>` +
          goose({ x: 84, y: 300, size: 60 }) +
          `<text x="164" y="${300 + 44}" font-family="${SANS}" font-size="42" font-weight="600" fill="${T.ink}" letter-spacing="-0.8">Honk</text>` +
          block({
            text: "Paste your schedule. See who's in it.",
            x: 84,
            y: 520,
            size: 82,
            lineHeight: 98,
            weight: 600,
            maxWidth: w - 168,
            tracking: -2,
            ratio: 0.5,
          }).svg +
          block({
            text: "Who shares your lectures, and when you and your friends are free at the same time.",
            x: 84,
            y: 790,
            size: 34,
            lineHeight: 50,
            fill: T.inkSoft,
            maxWidth: w - 168,
            ratio: 0.5,
          }).svg +
          weekCard({ x: 84, y: 960, w: w - 168, h: 620, highlight: "CS 135" }) +
          `<rect x="84" y="1660" width="${w - 168}" height="112" rx="24" fill="${T.clay}"/>` +
          `<text x="${w / 2}" y="1732" text-anchor="middle" font-family="${SANS}" font-size="38" font-weight="600" fill="#FFFDFA">honk-loo.vercel.app</text>`,
      );
    })(),
  );

  console.log(`wrote ${written.length} files:`);
  for (const f of written) console.log("  " + f);
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
