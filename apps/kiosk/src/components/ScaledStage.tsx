import { useEffect, useState, type ReactNode } from 'react';

export const STAGE_WIDTH = 1080;
export const STAGE_HEIGHT = 1920;

/**
 * Renders a fixed 1080×1920 design canvas scaled uniformly to fit any portrait screen
 * (letterboxed if the aspect ratio differs), so layouts are identical everywhere.
 *
 * Uses CSS `zoom` rather than `transform: scale()`: zoom scales the layout box too, so the
 * stage never overflows the window (with transforms, focusing a control could scroll the
 * unscaled 1080×1920 box out of view).
 */
export function ScaledStage({ children, dir }: { children: ReactNode; dir: 'ltr' | 'rtl' }) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const update = () =>
      setScale(Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-[#2a0e14]">
      <div
        className="stage relative shrink-0 overflow-hidden bg-canvas text-ink"
        dir={dir}
        style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT, zoom: scale }}
      >
        {children}
      </div>
    </div>
  );
}
