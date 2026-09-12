interface AdminSparklineProps {
  values: number[];
  className?: string;
}

/**
 * A small, dependency-free trend line. Purely decorative support for the
 * number beside it, so it carries no labels and is hidden from screen readers.
 */
export function AdminSparkline({ values, className }: AdminSparklineProps) {
  if (values.length < 2) {
    return <div className={className} aria-hidden="true" />;
  }

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = 100 / (values.length - 1);

  const points = values
    .map((v, i) => `${(i * step).toFixed(2)},${(28 - ((v - min) / span) * 24).toFixed(2)}`)
    .join(' ');

  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
