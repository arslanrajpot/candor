// Brand mark — an open ring forming "C", on brand teal. Matches the
// favicon (src/app/icon.svg) one-for-one. Geometric rather than a literal
// letterform glyph so it stays crisp at any size, in both themes, without a
// font dependency.
export function CandorMark({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-md bg-brand"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 96 96" width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} fill="none">
        <path
          d="M 62.14 62.14 A 20 20 0 1 1 62.14 33.86"
          stroke="#FFFFFF"
          strokeWidth={13}
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
