/**
 * The goose, as path data.
 *
 * Kept here rather than in the component so the header mark, the favicon, the
 * Apple touch icon and the OG image are all literally the same drawing — a
 * mark that drifts between surfaces stops being a mark.
 *
 * Head and neck in profile, drawn on a 32×32 grid. The notch is a true hole
 * (via `fill-rule="evenodd"`), so it shows the background through rather than
 * being painted a colour that would be wrong in one of the two themes. It is
 * anatomically the Canada goose cheek patch and it reads as an eye, which is
 * what makes the mark legible at 16px.
 */

export const GOOSE_VIEWBOX = "0 0 32 32";

export const GOOSE_BODY =
  "M18.5 2.6C21.4 2.6 24.2 5.0 24.2 8.0L30.6 9.0L24.0 11.4C23.4 13.4 22.2 15.0 20.4 16.4C17.0 19.0 15.4 21.8 15.0 25.6C14.85 27.2 14.9 28.4 15.1 29.4L9.7 29.4C9.3 26.6 9.6 23.4 10.8 20.6C11.8 18.2 13.2 16.3 14.6 14.9C13.4 13.1 13.0 10.9 13.0 8.0C13.0 5.0 15.5 2.6 18.5 2.6Z";

export const GOOSE_EYE = "M13.9 7.4a2.5 1.7 0 1 0 5.0 0a2.5 1.7 0 1 0 -5.0 0Z";

/** The whole mark as one path, for `fill-rule="evenodd"`. */
export const GOOSE_PATH = `${GOOSE_BODY} ${GOOSE_EYE}`;

/** Brand clay, hard-coded where `currentColor` cannot reach (favicons, OG). */
export const GOOSE_CLAY = "#C97B4A";
export const GOOSE_CREAM = "#FDFBF6";
