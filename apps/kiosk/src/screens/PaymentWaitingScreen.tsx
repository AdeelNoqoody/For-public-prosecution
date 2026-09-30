import { useEffect, useState } from 'react';
import { WifiOff, X } from 'lucide-react';
import { isFinalStatus, type PaymentView } from '@kiosk/shared';
import { api } from '../api/client';
import { usePaymentTracking } from '../api/usePaymentTracking';
import { CountdownRing } from '../components/CountdownRing';
import { AppHeader } from '../components/ScreenLayout';
import { TerminalAnimation } from '../components/TerminalAnimation';
import { Button } from '../components/ui';
import { useCountdown } from '../hooks/useCountdown';
import { useI18n } from '../i18n/I18nProvider';
import { useSession } from '../state/session';

/** "Tap / insert your card" screen. Live status via WebSocket; never interrupted by the idle timer. */
export function PaymentWaitingScreen({ initial }: { initial: PaymentView }) {
  const { t, formatMoney } = useI18n();
  const { navigate } = useSession();
  const { payment, connection, applyUpdate } = usePaymentTracking(initial);
  const [cancelling, setCancelling] = useState(false);
  const [cancelFailed, setCancelFailed] = useState(false);

  const createdAt = Date.parse(payment.createdAt);
  const deadline = payment.expiresAt ? Date.parse(payment.expiresAt) : createdAt + 120_000;
  const totalSeconds = Math.max(1, Math.round((deadline - createdAt) / 1000));
  const secondsLeft = useCountdown(deadline);

  useEffect(() => {
    if (isFinalStatus(payment.status))
      navigate({ name: 'paymentResult', payment }, { replace: true });
  }, [payment, navigate]);

  const cancel = async () => {
    setCancelling(true);
    setCancelFailed(false);
    try {
      applyUpdate(await api.cancelPayment(payment.paymentId));
    } catch {
      setCancelFailed(true);
      setCancelling(false);
    }
  };

  const status =
    connection === 'reconnecting'
      ? t('waiting.status.reconnecting')
      : cancelling
        ? t('waiting.status.cancelling')
        : secondsLeft === 0
          ? t('waiting.status.checking')
          : t('waiting.status.waiting');

  return (
    <div className="flex h-full flex-col" data-testid="payment-waiting">
      <AppHeader />
      <div className="flex flex-1 flex-col items-center px-14 pt-14 text-center">
        <h1 className="text-5xl leading-tight font-extrabold">{t('waiting.title')}</h1>
        <p className="mt-5 max-w-[900px] text-3xl text-muted">{t('waiting.instruction')}</p>

        <div className="mt-8">
          <TerminalAnimation />
        </div>

        <div className="mt-10 flex w-full items-center justify-between rounded-[2rem] border-2 border-line bg-surface px-10 py-8">
          <div className="text-start">
            <p className="text-2xl text-muted">{t('waiting.amount')}</p>
            <p
              className="text-6xl font-extrabold text-brand tabular-nums"
              data-testid="waiting-amount"
            >
              {formatMoney(payment.amountMinor, payment.currency)}
            </p>
          </div>
          <CountdownRing
            secondsLeft={secondsLeft}
            totalSeconds={totalSeconds}
            label={t('waiting.timeLeft')}
          />
        </div>

        <p
          className="mt-8 flex min-h-[48px] items-center gap-4 text-2xl font-bold text-brand"
          role="status"
          aria-live="polite"
          data-testid="waiting-status"
        >
          {connection === 'reconnecting' ? (
            <WifiOff className="size-9 text-warning" aria-hidden />
          ) : (
            <span className="status-dot size-5 rounded-full bg-brand" aria-hidden />
          )}
          {status}
        </p>
        {cancelFailed && (
          <p className="mt-2 text-xl font-semibold text-danger">{t('waiting.cancelFailed')}</p>
        )}
        <p className="mt-2 text-xl text-muted">{t('waiting.doNotLeave')}</p>
      </div>

      <footer className="flex h-[180px] shrink-0 items-center justify-center border-t-2 border-line bg-surface px-12">
        <Button
          variant="danger"
          size="lg"
          onClick={cancel}
          loading={cancelling}
          icon={<X className="size-9" />}
          className="min-w-[420px]"
          data-testid="payment-cancel"
        >
          {t('common.cancel')}
        </Button>
      </footer>
    </div>
  );
}
