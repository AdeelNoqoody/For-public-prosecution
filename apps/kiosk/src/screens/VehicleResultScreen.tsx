import { useState } from 'react';
import { CalendarDays, CreditCard, MapPin, Square, SquareCheck } from 'lucide-react';
import { sumMinor, type PayableItem, type VehicleResult, type Violation } from '@kiosk/shared';
import { PlateBadge } from '../components/PlateBadge';
import { ScreenLayout } from '../components/ScreenLayout';
import { TotalBar } from '../components/TotalBar';
import { Button, Card, cx } from '../components/ui';
import { useI18n } from '../i18n/I18nProvider';
import { useServices } from '../state/services';
import { useSession } from '../state/session';

export function toPayableItem(violation: Violation): PayableItem {
  return {
    id: violation.id,
    kind: 'VIOLATION',
    description: violation.description,
    amountMinor: violation.amountMinor,
    currency: violation.currency,
  };
}

/** Car number result: vehicle details + selectable violations. */
export function VehicleResultScreen({
  serviceId,
  result,
}: {
  serviceId: string;
  result: VehicleResult;
}) {
  const { t, lt, formatMoney, formatDate, formatDateTime } = useI18n();
  const { navigate, setCart } = useSession();
  const service = useServices().find(serviceId);
  const { vehicle, violations } = result;
  const [selected, setSelected] = useState<Set<string>>(() => new Set(violations.map((v) => v.id)));

  const allSelected = violations.length > 0 && selected.size === violations.length;
  const selectedViolations = violations.filter((v) => selected.has(v.id));
  const total = sumMinor(selectedViolations.map((v) => v.amountMinor));

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pay = () => {
    setCart(selectedViolations.map(toPayableItem));
    navigate({ name: 'paymentSummary' });
  };

  return (
    <ScreenLayout
      title={t('vehicle.title')}
      subtitle={service ? lt(service.title) : undefined}
      bottomBar={
        violations.length > 0 ? (
          <TotalBar
            amountMinor={total}
            caption={t('vehicle.selectedCount', { n: selected.size })}
          />
        ) : undefined
      }
      action={
        violations.length > 0 && (
          <Button
            size="lg"
            onClick={pay}
            disabled={selected.size === 0}
            icon={<CreditCard className="size-9" />}
            className="min-w-[340px]"
            data-testid="pay-selected"
          >
            {t('vehicle.payButton')}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-8">
        <Card className="flex flex-col gap-6">
          <div className="flex items-center justify-between gap-6">
            <div className="min-w-0">
              <p className="text-xl text-muted">{t('vehicle.make')}</p>
              <p className="text-4xl font-extrabold" data-testid="vehicle-make">
                {vehicle.make} {vehicle.model}
              </p>
            </div>
            <PlateBadge plateType={vehicle.plateType} plateNumber={vehicle.plateNumber} />
          </div>
          <dl className="grid grid-cols-3 gap-6 border-t-2 border-line pt-6">
            <div>
              <dt className="text-xl text-muted">{t('vehicle.year')}</dt>
              <dd className="text-2xl font-bold">{vehicle.year}</dd>
            </div>
            <div>
              <dt className="text-xl text-muted">{t('vehicle.color')}</dt>
              <dd className="text-2xl font-bold">{lt(vehicle.color)}</dd>
            </div>
            {vehicle.registrationExpiry && (
              <div>
                <dt className="text-xl text-muted">{t('vehicle.registrationExpiry')}</dt>
                <dd className="text-2xl font-bold">{formatDate(vehicle.registrationExpiry)}</dd>
              </div>
            )}
          </dl>
        </Card>

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-extrabold">
              {t('vehicle.violations')} ({violations.length})
            </h2>
            {violations.length > 0 && (
              <p className="mt-1 text-xl text-muted">{t('vehicle.selectHint')}</p>
            )}
          </div>
          {violations.length > 0 && (
            <Button
              variant="secondary"
              size="md"
              onClick={() =>
                setSelected(allSelected ? new Set() : new Set(violations.map((v) => v.id)))
              }
              data-testid="toggle-all"
            >
              {allSelected ? t('vehicle.deselectAll') : t('vehicle.selectAll')}
            </Button>
          )}
        </div>

        {violations.length === 0 ? (
          <Card className="text-center text-2xl text-muted">{t('vehicle.noViolations')}</Card>
        ) : (
          <ul className="flex flex-col gap-5" data-testid="violations">
            {violations.map((violation) => {
              const checked = selected.has(violation.id);
              const Check = checked ? SquareCheck : Square;
              return (
                <li key={violation.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => toggle(violation.id)}
                    data-testid={`violation-${violation.id}`}
                    className={cx(
                      'flex w-full items-center gap-7 rounded-[1.75rem] border-[3px] bg-surface px-8 py-7 text-start',
                      'transition-transform duration-100 active:scale-[0.99]',
                      checked ? 'border-brand shadow-md shadow-brand/10' : 'border-line',
                    )}
                  >
                    <Check
                      className={cx('size-16 shrink-0', checked ? 'text-brand' : 'text-muted')}
                      aria-hidden
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-2">
                      <span className="text-2xl font-extrabold">{lt(violation.description)}</span>
                      <span className="flex flex-wrap gap-x-7 gap-y-1 text-xl text-muted">
                        <span className="inline-flex items-center gap-2">
                          <CalendarDays className="size-7" aria-hidden />
                          {formatDateTime(violation.date)}
                        </span>
                        <span className="inline-flex items-center gap-2">
                          <MapPin className="size-7" aria-hidden />
                          {lt(violation.location)}
                        </span>
                      </span>
                      <span className="text-lg text-muted">
                        {t('violation.id')}: <span dir="ltr">{violation.id}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-3xl font-extrabold tabular-nums">
                      {formatMoney(violation.amountMinor, violation.currency)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </ScreenLayout>
  );
}
