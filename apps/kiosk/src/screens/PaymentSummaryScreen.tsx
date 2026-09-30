import { useState } from 'react';
import { CreditCard, ShieldCheck } from 'lucide-react';
import { isFinalStatus, sumMinor } from '@kiosk/shared';
import { api, errorMessageKey } from '../api/client';
import { ScreenLayout } from '../components/ScreenLayout';
import { TotalBar } from '../components/TotalBar';
import { Button, Card, ErrorBanner, Spinner } from '../components/ui';
import { runtimeConfig } from '../config/runtime';
import { useI18n } from '../i18n/I18nProvider';
import { useSession } from '../state/session';

export function PaymentSummaryScreen() {
  const { t, lt, formatMoney } = useI18n();
  const { cart, navigate, setBusy, reset } = useSession();
  // One key per visit to this screen: double taps / retries of the same request are de-duplicated.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const total = sumMinor(cart.map((item) => item.amountMinor));

  const pay = async () => {
    setCreating(true);
    setBusy(true);
    setError(null);
    try {
      const { payment } = await api.createPayment(
        { kioskId: runtimeConfig.kioskId, items: cart, amountMinor: total, currency: 'QAR' },
        idempotencyKey,
      );
      navigate(
        isFinalStatus(payment.status)
          ? { name: 'paymentResult', payment }
          : { name: 'paymentWaiting', payment },
        { replace: true },
      );
    } catch (err) {
      setError(err);
      setCreating(false);
    } finally {
      setBusy(false);
    }
  };

  if (cart.length === 0) {
    return (
      <ScreenLayout title={t('summary.title')}>
        <Card className="text-center text-2xl text-muted">{t('error.generic')}</Card>
        <Button className="mt-8" onClick={reset}>
          {t('common.home')}
        </Button>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout
      title={t('summary.title')}
      subtitle={t('summary.subtitle')}
      showBack={!creating}
      showHome={!creating}
      bottomBar={<TotalBar amountMinor={total} />}
      action={
        <Button
          size="lg"
          onClick={pay}
          loading={creating}
          icon={<CreditCard className="size-10" />}
          className="min-w-[400px]"
          data-testid="pay-by-card"
        >
          {t('summary.payByCard')}
        </Button>
      }
    >
      <div className="flex flex-col gap-8">
        <Card>
          <h2 className="mb-4 text-2xl font-extrabold text-muted">
            {t('summary.items')} ({cart.length})
          </h2>
          <ul data-testid="summary-items">
            {cart.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-8 border-b-2 border-line/70 py-6 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-2xl font-bold">{lt(item.description)}</p>
                  <p className="text-lg text-muted" dir="ltr">
                    {item.id}
                  </p>
                </div>
                <p className="shrink-0 text-3xl font-extrabold tabular-nums">
                  {formatMoney(item.amountMinor, item.currency)}
                </p>
              </li>
            ))}
          </ul>
        </Card>

        <p className="flex items-center gap-4 text-xl text-muted">
          <ShieldCheck className="size-9 shrink-0 text-success" aria-hidden />
          {t('summary.cardsNote')}
        </p>

        {creating && <Spinner label={t('summary.creating')} className="py-8" />}
        {error !== null && <ErrorBanner message={t(errorMessageKey(error))} />}
      </div>
    </ScreenLayout>
  );
}
