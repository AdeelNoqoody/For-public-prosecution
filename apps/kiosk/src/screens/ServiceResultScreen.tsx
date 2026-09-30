import { CreditCard } from 'lucide-react';
import { sumMinor, type ServiceResult } from '@kiosk/shared';
import { ScreenLayout } from '../components/ScreenLayout';
import { TotalBar } from '../components/TotalBar';
import { Badge, Button, Card, DetailRow } from '../components/ui';
import { useI18n } from '../i18n/I18nProvider';
import { useServices } from '../state/services';
import { useSession } from '../state/session';

export function ServiceResultScreen({
  serviceId,
  result,
}: {
  serviceId: string;
  result: ServiceResult;
}) {
  const { t, lt, formatMoney } = useI18n();
  const { navigate, setCart, reset } = useSession();
  const service = useServices().find(serviceId);
  const payable = result.payableItems;
  const total = sumMinor(payable.map((item) => item.amountMinor));

  const pay = () => {
    setCart(payable);
    navigate({ name: 'paymentSummary' });
  };

  return (
    <ScreenLayout
      title={lt(result.title)}
      subtitle={service ? lt(service.title) : undefined}
      bottomBar={payable.length > 0 ? <TotalBar amountMinor={total} /> : undefined}
      action={
        payable.length > 0 ? (
          <Button
            size="lg"
            onClick={pay}
            icon={<CreditCard className="size-9" />}
            className="min-w-[340px]"
            data-testid="service-pay"
          >
            {t('serviceResult.pay')}
          </Button>
        ) : (
          <Button size="lg" onClick={reset} className="min-w-[280px]">
            {t('common.done')}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-8">
        <Card>
          <div className="mb-4 flex items-center justify-between gap-6">
            {result.reference && (
              <div>
                <p className="text-xl text-muted">{t('serviceResult.reference')}</p>
                <p className="text-4xl font-extrabold" dir="ltr" data-testid="service-reference">
                  {result.reference}
                </p>
              </div>
            )}
            {result.status && <Badge tone={result.status.tone}>{lt(result.status.label)}</Badge>}
          </div>
          <dl>
            {result.rows.map((row) => (
              <DetailRow key={row.label.en} label={lt(row.label)} value={lt(row.value)} />
            ))}
          </dl>
        </Card>

        {payable.length > 0 ? (
          <Card>
            <h2 className="mb-2 text-2xl font-extrabold">{t('serviceResult.amountDue')}</h2>
            <dl>
              {payable.map((item) => (
                <DetailRow
                  key={item.id}
                  label={lt(item.description)}
                  value={formatMoney(item.amountMinor, item.currency)}
                />
              ))}
            </dl>
          </Card>
        ) : (
          <p className="text-center text-2xl text-muted">{t('serviceResult.nothingToPay')}</p>
        )}
      </div>
    </ScreenLayout>
  );
}
