/**
 * The goose. Head and neck in one colour, small.
 *
 * This is the entire mascot budget for the product — there are no geese in
 * empty states, no honking, no goose emoji in buttons.
 */
export function GooseMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M12.6 10.4c0 5.2-3.4 7.4-3.4 13.9"
        stroke="currentColor"
        strokeWidth="3.3"
        strokeLinecap="round"
      />
      <circle cx="14.5" cy="7.4" r="4.3" fill="currentColor" />
      <path d="M18.2 6.1 24.6 7.5 18.2 9.1Z" fill="currentColor" />
    </svg>
  );
}
