/**
 * Regenerates `src/app/icon.svg` from the goose geometry.
 *
 *   npx vite-node scripts/generate-icon.ts
 *
 * The favicon is a standalone file, so it cannot use the CSS custom properties
 * the in-app mark uses. Generating it from the same constants keeps it from
 * drifting away from the header mark. Run this after changing anything in
 * `src/lib/goose.ts` and commit the result.
 */

import { writeFileSync } from "node:fs";
import {
  GOOSE_BEAK,
  GOOSE_BELLY,
  GOOSE_BODY,
  GOOSE_CHEEK,
  GOOSE_CREAM,
  GOOSE_HEAD,
  GOOSE_LIGHT,
  GOOSE_NECK,
  GOOSE_NECK_WIDTH,
  GOOSE_OUTLINE_WIDTH,
  GOOSE_TAIL,
} from "../src/lib/goose";

const p = GOOSE_LIGHT;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <rect width="32" height="32" rx="7" fill="${GOOSE_CREAM}"/>
  <g transform="translate(1.0 1.8) scale(0.94)" fill="none" stroke="${p.line}" stroke-width="${GOOSE_OUTLINE_WIDTH}" stroke-linejoin="round" stroke-linecap="round">
    <path d="${GOOSE_TAIL}" fill="${p.body}"/>
    <path d="${GOOSE_BODY}" fill="${p.body}"/>
    <path d="${GOOSE_BELLY}" fill="${p.belly}"/>
    <path d="${GOOSE_NECK}" stroke="${p.head}" stroke-width="${GOOSE_NECK_WIDTH}"/>
    <ellipse cx="${GOOSE_HEAD.cx}" cy="${GOOSE_HEAD.cy}" rx="${GOOSE_HEAD.rx}" ry="${GOOSE_HEAD.ry}" fill="${p.head}" stroke="none"/>
    <path d="${GOOSE_BEAK}" fill="${p.beak}" stroke="none"/>
    <path d="${GOOSE_CHEEK}" fill="${p.cheek}" stroke="none"/>
  </g>
</svg>
`;

writeFileSync("src/app/icon.svg", svg);
console.log(`icon.svg written (${svg.length} bytes)`);
