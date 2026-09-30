import { Hourglass } from 'lucide-react';
import { runtimeConfig } from '../config/runtime';
import { useCountdown, useDeadline } from '../hooks/useCountdown';
import { useI18n } from '../i18n/I18nProvider';
import { Button } from './ui';

/** "Are you still there?" dialog with a countdown; ends the session when it reaches zero. */
export function IdleOverlay({ onContinue, onTimeout }: { onContinue(): void; onTimeout(): void }) {
  const { t } = useI18n();
  const secondsLeft = useCountdown(useDeadline(runtimeConfig.idleWarningSeconds), onTimeout);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="idle-title"
      className="absolute inset-0 z-50 flex items-center justify-center bg-ink/70 px-16 backdrop-blur-sm"
      data-testid="idle-overlay"
    >
      <div className="flex w-full flex-col items-center gap-8 rounded-[2.5rem] bg-surface px-14 py-16 text-center shadow-2xl">
        <div className="flex size-44 items-center justify-center rounded-full bg-brand-soft text-brand">
          <Hourglass className="size-24" aria-hidden />
        </div>
        <h2 id="idle-title" className="text-5xl font-extrabold">
          {t('idle.title')}
        </h2>
        <p className="text-2xl text-muted">{t('idle.body', { n: secondsLeft })}</p>
        <div className="text-8xl font-extrabold text-brand tabular-nums" aria-hidden>
          {secondsLeft}
        </div>
        <div className="flex w-full flex-col gap-5">
          <Button size="xl" block onClick={onContinue} data-testid="idle-continue">
            {t('idle.continue')}
          </Button>
          <Button variant="ghost" size="lg" block onClick={onTimeout}>
            {t('idle.end')}
          </Button>
        </div>
      </div>
    </div>
  );
}
