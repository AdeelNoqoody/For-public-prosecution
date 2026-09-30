import { useState } from 'react';
import { Search } from 'lucide-react';
import {
  PLATE_NUMBER_MAX_LENGTH,
  PLATE_TYPES,
  isValidPlateNumber,
  type PlateType,
} from '@kiosk/shared';
import { api, errorMessageKey } from '../api/client';
import { NumericKeypad } from '../components/Keyboards';
import { ScreenLayout } from '../components/ScreenLayout';
import { Button, ErrorBanner, cx } from '../components/ui';
import { useI18n } from '../i18n/I18nProvider';
import { plateTypeKey } from '../i18n/messages';
import { useServices } from '../state/services';
import { useSession } from '../state/session';

export function PlateEntryScreen({ serviceId }: { serviceId: string }) {
  const { t, lt } = useI18n();
  const { navigate } = useSession();
  const service = useServices().find(serviceId);
  const [plateType, setPlateType] = useState<PlateType>('PRIVATE');
  const [plateNumber, setPlateNumber] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const edit = (next: string) => {
    setInvalid(false);
    setError(null);
    setPlateNumber(next.slice(0, PLATE_NUMBER_MAX_LENGTH));
  };

  const search = async () => {
    if (!isValidPlateNumber(plateNumber)) {
      setInvalid(true);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.lookupVehicle(plateType, plateNumber);
      navigate({ name: 'vehicleResult', serviceId, result });
    } catch (err) {
      setError(err);
      setLoading(false);
    }
  };

  return (
    <ScreenLayout
      title={t('plate.title')}
      subtitle={service ? lt(service.title) : undefined}
      action={
        <Button
          size="lg"
          onClick={search}
          loading={loading}
          disabled={plateNumber.length === 0}
          icon={<Search className="size-9" />}
          className="min-w-[320px]"
          data-testid="plate-search"
        >
          {t('common.search')}
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        <section>
          <h2 className="mb-4 text-2xl font-bold text-muted">{t('plate.typeLabel')}</h2>
          <div
            className="grid grid-cols-3 gap-4"
            role="radiogroup"
            aria-label={t('plate.typeLabel')}
          >
            {PLATE_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={plateType === type}
                onClick={() => setPlateType(type)}
                data-testid={`plate-type-${type}`}
                className={cx(
                  'min-h-[96px] rounded-2xl border-[3px] px-4 text-2xl font-bold transition-transform active:scale-[0.97]',
                  plateType === type
                    ? 'border-brand bg-brand text-on-brand'
                    : 'border-line bg-surface text-ink',
                )}
              >
                {t(plateTypeKey(type))}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-2xl font-bold text-muted">{t('plate.numberLabel')}</h2>
          <div
            dir="ltr"
            data-testid="plate-display"
            className={cx(
              'flex h-[160px] items-center justify-center rounded-3xl border-[5px] bg-surface shadow-inner',
              invalid ? 'border-danger' : 'border-ink',
            )}
          >
            {plateNumber ? (
              <span className="text-8xl font-extrabold tracking-[0.2em] tabular-nums">
                {plateNumber}
              </span>
            ) : (
              <span className="text-4xl text-muted/70">{t('plate.placeholder')}</span>
            )}
            <span className="caret ms-2 h-[90px] w-[6px] rounded bg-brand" aria-hidden />
          </div>
          <p
            className={cx(
              'mt-2 min-h-[36px] text-xl font-semibold text-danger',
              !invalid && 'invisible',
            )}
          >
            {t('plate.invalid')}
          </p>
        </section>

        {error !== null && <ErrorBanner message={t(errorMessageKey(error))} />}

        <NumericKeypad
          disabled={loading}
          onKey={(digit) => edit(plateNumber + digit)}
          onBackspace={() => edit(plateNumber.slice(0, -1))}
          onClear={() => edit('')}
        />
      </div>
    </ScreenLayout>
  );
}
