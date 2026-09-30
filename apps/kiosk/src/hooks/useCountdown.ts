import { useEffect, useRef, useState } from 'react';

/**
 * Counts down to `deadline` (epoch ms), re-rendering every 250ms.
 * Calls `onExpire` once when it reaches zero. Pass `null` to pause.
 */
export function useCountdown(deadline: number | null, onExpire?: () => void): number {
  const [now, setNow] = useState(() => Date.now());
  const expireRef = useRef(onExpire);
  useEffect(() => {
    expireRef.current = onExpire;
  });
  const firedFor = useRef<number | null>(null);

  useEffect(() => {
    if (deadline === null) return;
    const interval = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= deadline && firedFor.current !== deadline) {
        firedFor.current = deadline;
        expireRef.current?.();
      }
    }, 250);
    return () => clearInterval(interval);
  }, [deadline]);

  if (deadline === null) return 0;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** A deadline `seconds` from when the component mounted (stable across re-renders). */
export function useDeadline(seconds: number): number {
  const [deadline] = useState(() => Date.now() + seconds * 1000);
  return deadline;
}
