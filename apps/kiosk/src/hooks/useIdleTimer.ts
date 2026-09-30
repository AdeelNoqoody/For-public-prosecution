import { useCallback, useEffect, useRef, useState } from 'react';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;

/**
 * Returns `idle: true` once there has been no user activity for `timeoutMs`.
 * Never idle while `enabled` is false. Any activity (or `markActive`) restarts the timer.
 */
export function useIdleTimer(timeoutMs: number, enabled: boolean) {
  const [idle, setIdle] = useState(false);
  const activityRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), timeoutMs);
    };
    const onActivity = () => {
      setIdle(false);
      arm();
    };
    activityRef.current = onActivity;
    arm();
    // Capture phase so activity counts even if a component stops propagation.
    for (const event of ACTIVITY_EVENTS)
      window.addEventListener(event, onActivity, { capture: true, passive: true });
    return () => {
      clearTimeout(timer);
      for (const event of ACTIVITY_EVENTS)
        window.removeEventListener(event, onActivity, { capture: true });
      activityRef.current = () => undefined;
      setIdle(false);
    };
  }, [enabled, timeoutMs]);

  const markActive = useCallback(() => activityRef.current(), []);
  return { idle: enabled && idle, markActive };
}
