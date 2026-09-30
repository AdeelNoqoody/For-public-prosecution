/** Circular countdown indicator. */
export function CountdownRing({
  secondsLeft,
  totalSeconds,
  label,
}: {
  secondsLeft: number;
  totalSeconds: number;
  label: string;
}) {
  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  const progress = totalSeconds > 0 ? Math.min(1, secondsLeft / totalSeconds) : 0;
  const urgent = secondsLeft <= 15;

  return (
    <div className="relative size-[210px]" role="timer" aria-label={label}>
      <svg viewBox="0 0 200 200" className="size-full -rotate-90">
        <circle cx="100" cy="100" r={radius} fill="none" strokeWidth="14" className="stroke-line" />
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          className={urgent ? 'stroke-danger' : 'stroke-brand'}
          style={{ transition: 'stroke-dashoffset 250ms linear' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`text-6xl font-extrabold tabular-nums ${urgent ? 'text-danger' : 'text-ink'}`}
          data-testid="payment-countdown"
        >
          {secondsLeft}
        </span>
      </div>
    </div>
  );
}
