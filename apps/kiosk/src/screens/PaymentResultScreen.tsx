import { useState } from 'react';
import {
  Ban,
  CircleCheck,
  CircleX,
  Clock,
  House,
  Printer,
  QrCode,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { PaymentStatus, PaymentView } from '@kiosk/shared';
import { AppHeader } from '../components/ScreenLayout';
import { Button, Card, DetailRow, cx } from '../components/ui';
import { branding } from '../config/branding';
import { runtimeConfig } from '../config/runtime';
import { useCountdown } from '../hooks/useCountdown';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/messages';
import { useSession } from '../state/session';

const KNOWN_REASONS = new Set([
  'INSUFFICIENT_FUNDS',
  'DO_NOT_HONOUR',
  'TERMINAL_ERROR',
  'POS_UNAVAILABLE',
  'AMOUNT_MISMATCH',
  'NO_RESPONSE_FROM_TERMINAL',
  'INTERRUPTED',
]);

const STATUS_VIEW: Record<PaymentStatus, { icon: LucideIcon; tone: string; title: MessageKey }> = {
  APPROVED: {
    icon: CircleCheck,
    tone: 'text-success bg-success-soft',
    title: 'result.approved.title',
  },
  DECLINED: { icon: CircleX, tone: 'text-danger bg-danger-soft', title: 'result.declined.title' },
  ERROR: { icon: CircleX, tone: 'text-danger bg-danger-soft', title: 'result.error.title' },
  TIMEOUT: { icon: Clock, tone: 'text-warning bg-warning-soft', title: 'result.timeout.title' },
  CANCELLED: { icon: Ban, tone: 'text-warning bg-warning-soft', title: 'result.cancelled.title' },
  // Non-final states never reach this screen; treat defensively as an error.
  CREATED: { icon: CircleX, tone: 'text-danger bg-danger-soft', title: 'result.error.title' },
  PENDING: { icon: CircleX, tone: 'text-danger bg-danger-soft', title: 'result.error.title' },
};

function receiptQrValue(payment: PaymentView): string {
  // TODO: replace with a link to a hosted e-receipt once available.
  return [
    `RECEIPT:${payment.receiptNumber ?? ''}`,
    `TXN:${payment.posTransactionId ?? ''}`,
    `AMOUNT:${(payment.amountMinor / 100).toFixed(2)} ${payment.currency}`,
    `DATE:${payment.completedAt ?? payment.updatedAt}`,
    `REF:${payment.merchantReference}`,
  ].join(';');
}

export function PaymentResultScreen({ payment }: { payment: PaymentView }) {
  const { t, lt, formatMoney, formatDateTime } = useI18n();
  const { reset, navigate } = useSession();
  const [deadline, setDeadline] = useState(
    () => Date.now() + runtimeConfig.resultAutoReturnSeconds * 1000,
  );
  const secondsLeft = useCountdown(deadline, reset);
  const [showQr, setShowQr] = useState(false);
  const [printState, setPrintState] = useState<'idle' | 'printing' | 'failed'>('idle');

  // Any interaction gives the user another full countdown.
  const extend = () => setDeadline(Date.now() + runtimeConfig.resultAutoReturnSeconds * 1000);

  const approved = payment.status === 'APPROVED';
  const retryable = !approved;
  const view = STATUS_VIEW[payment.status];
  const Icon = view.icon;

  const subtitle = approved
    ? t('result.approved.subtitle')
    : payment.status === 'TIMEOUT'
      ? t('result.timeout.subtitle')
      : payment.status === 'CANCELLED'
        ? t('result.cancelled.subtitle')
        : payment.customerMessage
          ? payment.customerMessage
          : t(
              payment.failureReason && KNOWN_REASONS.has(payment.failureReason)
                ? (`reason.${payment.failureReason}` as MessageKey)
                : 'reason.generic',
            );

  const print = async () => {
    extend();
    setPrintState('printing');
    try {
      if (window.kioskBridge) {
        const result = await window.kioskBridge.printReceipt();
        setPrintState(result.ok ? 'idle' : 'failed');
      } else {
        window.print();
        setPrintState('idle');
      }
    } catch {
      setPrintState('failed');
    }
  };

  const completedAt = payment.completedAt ?? payment.updatedAt;

  return (
    <div className="flex h-full flex-col" data-testid="payment-result" data-status={payment.status}>
      <AppHeader />
      <main className="kiosk-scroll flex flex-1 flex-col items-center overflow-y-auto px-12 pt-14 text-center">
        <div
          className={cx('flex size-[200px] items-center justify-center rounded-full', view.tone)}
        >
          <Icon className="size-[120px]" strokeWidth={1.8} aria-hidden />
        </div>
        <h1 className="mt-8 text-6xl font-extrabold" data-testid="result-title">
          {t(view.title)}
        </h1>
        <p className="mt-4 max-w-[900px] text-3xl text-muted">{subtitle}</p>

        <Card className="mt-10 w-full text-start">
          <dl>
            {payment.receiptNumber && (
              <DetailRow label={t('result.receiptNumber')} value={payment.receiptNumber} ltrValue />
            )}
            <DetailRow label={t('result.reference')} value={payment.merchantReference} ltrValue />
            {payment.posTransactionId && (
              <DetailRow
                label={t('result.transactionId')}
                value={payment.posTransactionId}
                ltrValue
              />
            )}
            <DetailRow
              label={t('result.amount')}
              value={formatMoney(payment.amountMinor, payment.currency)}
            />
            <DetailRow label={t('result.dateTime')} value={formatDateTime(completedAt)} />
            {payment.maskedPan && (
              <DetailRow
                label={t('result.card')}
                value={`${payment.cardScheme ?? ''} ${payment.maskedPan}`}
                ltrValue
              />
            )}
            {payment.authCode && (
              <DetailRow label={t('result.authCode')} value={payment.authCode} ltrValue />
            )}
            {payment.rrn && <DetailRow label={t('result.rrn')} value={payment.rrn} ltrValue />}
            {payment.pun && <DetailRow label={t('result.pun')} value={payment.pun} ltrValue />}
            {payment.terminalId && (
              <DetailRow label={t('result.terminalId')} value={payment.terminalId} ltrValue />
            )}
            {!approved && payment.customerMessage && (
              <DetailRow label={t('result.reason')} value={payment.customerMessage} />
            )}
          </dl>
        </Card>

        {printState === 'failed' && (
          <p className="mt-6 text-xl font-semibold text-danger">{t('result.printFailed')}</p>
        )}

        <p className="mt-auto py-8 text-2xl text-muted" data-testid="auto-return">
          {t('result.autoReturn', { n: secondsLeft })}
        </p>
      </main>

      <footer className="flex h-[180px] shrink-0 items-center gap-6 border-t-2 border-line bg-surface px-12">
        {approved ? (
          <>
            <Button
              variant="secondary"
              size="md"
              onClick={print}
              loading={printState === 'printing'}
              icon={<Printer className="size-9" />}
            >
              {t('result.print')}
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                extend();
                setShowQr(true);
              }}
              icon={<QrCode className="size-9" />}
              data-testid="show-qr"
            >
              {t('result.showQr')}
            </Button>
          </>
        ) : (
          retryable && (
            <Button
              variant="secondary"
              size="lg"
              onClick={() => navigate({ name: 'paymentSummary' }, { replace: true })}
              icon={<RotateCcw className="size-9" />}
              data-testid="result-retry"
            >
              {t('common.retry')}
            </Button>
          )
        )}
        <Button
          size="lg"
          className="ms-auto min-w-[240px]"
          onClick={reset}
          icon={<House className="size-9" />}
          data-testid="result-done"
        >
          {t('common.done')}
        </Button>
      </footer>

      {approved && showQr && (
        <div
          role="dialog"
          aria-modal="true"
          className="absolute inset-0 z-40 flex items-center justify-center bg-ink/70 px-16 backdrop-blur-sm"
          onClick={() => {
            extend();
            setShowQr(false);
          }}
          data-testid="receipt-qr"
        >
          <div className="flex flex-col items-center gap-8 rounded-[2.5rem] bg-surface px-14 py-14 shadow-2xl">
            <p className="text-3xl font-extrabold">{t('result.qrHint')}</p>
            <div className="rounded-3xl border-2 border-line bg-white p-8">
              <QRCodeSVG value={receiptQrValue(payment)} size={480} level="M" />
            </div>
            <p className="text-2xl font-bold" dir="ltr">
              {payment.receiptNumber}
            </p>
            <Button size="lg" block variant="secondary">
              {t('result.hideQr')}
            </Button>
          </div>
        </div>
      )}

      {/* Print-only receipt (see @media print in index.css). */}
      {approved && (
        <div className="print-receipt" aria-hidden>
          <div className="pr-center">
            <h2>{lt(branding.name)}</h2>
            <p className="pr-status">{t('result.approved.title')}</p>
          </div>

          <div className="pr-divider" />
          <div className="pr-row">
            <span>{t('result.receiptNumber')}</span>
            <span>{payment.receiptNumber}</span>
          </div>
          <div className="pr-row">
            <span>{t('result.transactionId')}</span>
            <span>{payment.posTransactionId}</span>
          </div>
          <div className="pr-row">
            <span>{t('result.dateTime')}</span>
            <span>{formatDateTime(completedAt)}</span>
          </div>

          <div className="pr-divider" />
          {payment.items.map((item) => (
            <div className="pr-row" key={item.id}>
              <span>{lt(item.description)}</span>
              <span>{formatMoney(item.amountMinor, item.currency)}</span>
            </div>
          ))}

          <div className="pr-divider" />
          <div className="pr-row pr-total">
            <span>{t('result.amount')}</span>
            <span>{formatMoney(payment.amountMinor, payment.currency)}</span>
          </div>

          {(payment.maskedPan ||
            payment.authCode ||
            payment.rrn ||
            payment.pun ||
            payment.terminalId) && (
            <>
              <div className="pr-divider" />
              {payment.maskedPan && (
                <div className="pr-row">
                  <span>{t('result.card')}</span>
                  <span>{`${payment.cardScheme ?? ''} ${payment.maskedPan}`.trim()}</span>
                </div>
              )}
              {payment.authCode && (
                <div className="pr-row">
                  <span>{t('result.authCode')}</span>
                  <span>{payment.authCode}</span>
                </div>
              )}
              {payment.rrn && (
                <div className="pr-row">
                  <span>{t('result.rrn')}</span>
                  <span>{payment.rrn}</span>
                </div>
              )}
              {payment.pun && (
                <div className="pr-row">
                  <span>{t('result.pun')}</span>
                  <span>{payment.pun}</span>
                </div>
              )}
              {payment.terminalId && (
                <div className="pr-row">
                  <span>{t('result.terminalId')}</span>
                  <span>{payment.terminalId}</span>
                </div>
              )}
            </>
          )}

          <div className="pr-divider" />
          <p className="pr-center pr-thanks">{t('result.thankYou')}</p>
        </div>
      )}
    </div>
  );
}
