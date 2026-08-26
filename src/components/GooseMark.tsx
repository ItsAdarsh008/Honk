import { GOOSE_PATH, GOOSE_VIEWBOX } from "@/lib/goose";

/**
 * The goose. Head and neck in profile, one colour, small.
 *
 * This is the entire mascot budget for the product — there are no geese in
 * empty states, no honking, no goose emoji in buttons.
 */
export function GooseMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={GOOSE_VIEWBOX}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path fillRule="evenodd" clipRule="evenodd" d={GOOSE_PATH} fill="currentColor" />
    </svg>
  );
}
