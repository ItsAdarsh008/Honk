/**
 * The goose, as geometry.
 *
 * A Canada goose in profile: charcoal head and neck, the white chinstrap that
 * is the species' one unmistakable marking, a clay body, and a hairline
 * outline. The earlier one-colour silhouette was legible but read as a generic
 * waterbird — the chinstrap and the body are what make it a *goose*.
 *
 * Natural colours turn out to sit inside the palette rather than fight it:
 * charcoal is the ink token, the chinstrap is the cream ground, and the body
 * is the clay accent. Nothing here is a loud yellow cartoon.
 *
 * Kept as data so the header mark, favicon, Apple touch icon and OG image are
 * all literally the same drawing. Drawn on a 32×32 grid, facing right.
 */

export const GOOSE_VIEWBOX = "0 0 32 32";

export const GOOSE_TAIL = "M1.6 16.4 6.0 18.0 4.4 21.4Z";

export const GOOSE_BODY =
  "M4.6 18.6C7.2 15.8 11.0 14.4 14.6 14.9C17.4 15.3 19.4 16.8 20.4 19.0C21.4 21.3 21.0 24.0 19.3 25.8C17.4 27.8 14.2 28.7 11.0 28.3C7.6 27.9 5.0 25.9 3.9 23.0C3.3 21.4 3.6 19.8 4.6 18.6Z";

/** The paler underside, which reads as the fold of a folded wing. */
export const GOOSE_BELLY =
  "M5.4 22.6C7.6 25.0 11.2 26.4 14.8 26.0C17.2 25.7 19.0 24.6 20.0 23.0C20.4 24.6 19.9 26.3 18.6 27.4C16.7 29.0 13.6 29.6 10.6 29.1C7.4 28.6 5.0 26.6 4.2 24.0C4.4 23.4 4.8 22.9 5.4 22.6Z";

/** Stroked, not filled — a tapered fill is not worth the extra path. */
export const GOOSE_NECK = "M14.0 16.6C13.4 12.6 15.2 9.0 18.6 7.2";
export const GOOSE_NECK_WIDTH = 4.6;

export const GOOSE_HEAD = { cx: 22.4, cy: 6.6, rx: 4.1, ry: 3.7 } as const;

export const GOOSE_BEAK = "M25.9 5.2 31.3 6.9 25.9 8.6Z";

/** The chinstrap. The one marking that says Canada goose and not duck. */
export const GOOSE_CHEEK =
  "M21.0 3.6C22.2 4.6 22.6 6.4 22.2 8.2C22.0 9.2 21.5 9.9 20.9 10.2C19.7 8.4 19.6 5.6 21.0 3.6Z";

export const GOOSE_OUTLINE_WIDTH = 1.05;

export interface GoosePalette {
  body: string;
  belly: string;
  head: string;
  cheek: string;
  beak: string;
  line: string;
}

/**
 * Literal colours, for the places CSS custom properties cannot reach: the
 * standalone favicon file and the Satori-rendered OG and Apple icons. These
 * are the light-mode values, which is correct for both — each sits on a cream
 * ground of its own.
 */
export const GOOSE_LIGHT: GoosePalette = {
  body: "#C97B4A",
  belly: "#E0A878",
  head: "#33322C",
  cheek: "#FDFBF6",
  beak: "#33322C",
  line: "#33322C",
};

/** In the app the mark follows the theme, so it reads on cream and on near-black. */
export const GOOSE_THEMED: GoosePalette = {
  body: "var(--goose-body)",
  belly: "var(--goose-belly)",
  head: "var(--goose-head)",
  cheek: "var(--goose-cheek)",
  beak: "var(--goose-beak)",
  line: "var(--goose-line)",
};

export const GOOSE_CREAM = "#FDFBF6";
