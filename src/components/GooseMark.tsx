import {
  GOOSE_BEAK,
  GOOSE_BELLY,
  GOOSE_BODY,
  GOOSE_CHEEK,
  GOOSE_HEAD,
  GOOSE_NECK,
  GOOSE_NECK_WIDTH,
  GOOSE_OUTLINE_WIDTH,
  GOOSE_TAIL,
  GOOSE_THEMED,
  GOOSE_VIEWBOX,
  type GoosePalette,
} from "@/lib/goose";

/**
 * The goose. A Canada goose in profile — charcoal head and neck, white
 * chinstrap, clay body, hairline outline.
 *
 * This is the entire mascot budget for the product: there are no geese in
 * empty states, no honking, no goose emoji in buttons.
 */
export function GooseMark({
  size = 24,
  className,
  palette = GOOSE_THEMED,
}: {
  size?: number;
  className?: string;
  /** Literal colours for the contexts where CSS variables do not resolve. */
  palette?: GoosePalette;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={GOOSE_VIEWBOX}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <g
        stroke={palette.line}
        strokeWidth={GOOSE_OUTLINE_WIDTH}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d={GOOSE_TAIL} fill={palette.body} />
        <path d={GOOSE_BODY} fill={palette.body} />
        <path d={GOOSE_BELLY} fill={palette.belly} />
        <path d={GOOSE_NECK} stroke={palette.head} strokeWidth={GOOSE_NECK_WIDTH} />
        <ellipse {...GOOSE_HEAD} fill={palette.head} stroke="none" />
        <path d={GOOSE_BEAK} fill={palette.beak} stroke="none" />
        <path d={GOOSE_CHEEK} fill={palette.cheek} stroke="none" />
      </g>
    </svg>
  );
}
