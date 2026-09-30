import { useState } from 'react';
import { Search } from 'lucide-react';
import { api, errorMessageKey } from '../api/client';
import { AlphaKeyboard, NumericKeypad } from '../components/Keyboards';
import { ScreenLayout } from '../components/ScreenLayout';
import { Button, ErrorBanner, cx } from '../components/ui';
import { useI18n } from '../i18n/I18nProvider';
import { useServices } from '../state/services';
import { useSession } from '../state/session';

/** Generic input form for "other" services, driven by the service's field definitions. */
export function ServiceFormScreen({ serviceId }: { serviceId: string }) {
  const { t, lt } = useI18n();
  const { navigate, reset } = useSession();
  const service = useServices().find(serviceId);
  const fields = service?.fields ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [invalidField, setInvalidField] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (!service) {
    return (
      <ScreenLayout title={t('error.generic')}>
        <Button onClick={reset}>{t('common.home')}</Button>
      </ScreenLayout>
    );
  }

  const active = fields[activeIndex];
  const edit = (updater: (value: string) => string) => {
    if (!active) return;
    setInvalidField(null);
    setError(null);
    setValues((current) => ({
      ...current,
      [active.id]: updater(current[active.id] ?? '').slice(0, active.maxLength),
    }));
  };

  const submit = async () => {
    const invalid = fields.find((field) => !new RegExp(field.pattern).test(values[field.id] ?? ''));
    if (invalid) {
      setInvalidField(invalid.id);
      setActiveIndex(fields.indexOf(invalid));
      return;
    }
    setLoading(true);
    try {
      const result = await api.lookupService(serviceId, values);
      navigate({ name: 'serviceResult', serviceId, result });
    } catch (err) {
      setError(err);
      setLoading(false);
    }
  };

  const Keyboard = active?.keyboard === 'alphanumeric' ? AlphaKeyboard : NumericKeypad;
  const hasAllValues = fields.every((field) => (values[field.id] ?? '').length > 0);

  return (
    <ScreenLayout
      title={lt(service.title)}
      subtitle={lt(service.description)}
      action={
        <Button
          size="lg"
          onClick={submit}
          loading={loading}
          disabled={!hasAllValues}
          icon={<Search className="size-9" />}
          className="min-w-[320px]"
          data-testid="form-submit"
        >
          {t('form.submit')}
        </Button>
      }
    >
      <div className="flex flex-col gap-8">
        {fields.map((field, index) => {
          const value = values[field.id] ?? '';
          const isActive = index === activeIndex;
          return (
            <div key={field.id}>
              <label
                className="mb-4 block text-2xl font-bold text-muted"
                htmlFor={`field-${field.id}`}
              >
                {lt(field.label)}
              </label>
              <button
                id={`field-${field.id}`}
                type="button"
                dir="ltr"
                onClick={() => setActiveIndex(index)}
                data-testid={`field-${field.id}`}
                className={cx(
                  'flex h-[150px] w-full items-center justify-center rounded-3xl border-[5px] bg-surface px-8',
                  invalidField === field.id
                    ? 'border-danger'
                    : isActive
                      ? 'border-brand'
                      : 'border-line',
                )}
              >
                {value ? (
                  <span className="text-6xl font-extrabold tracking-[0.12em] tabular-nums">
                    {value}
                  </span>
                ) : (
                  <span className="text-3xl text-muted/70">{field.placeholder ?? ''}</span>
                )}
                {isActive && (
                  <span className="caret ms-2 h-[76px] w-[6px] rounded bg-brand" aria-hidden />
                )}
              </button>
              <p
                className={cx(
                  'mt-3 min-h-[40px] text-xl font-semibold text-danger',
                  invalidField !== field.id && 'invisible',
                )}
              >
                {t('form.invalid')}
              </p>
            </div>
          );
        })}

        {error !== null && <ErrorBanner message={t(errorMessageKey(error))} />}

        {active && (
          <Keyboard
            disabled={loading}
            onKey={(char) => edit((v) => v + char)}
            onBackspace={() => edit((v) => v.slice(0, -1))}
            onClear={() => edit(() => '')}
          />
        )}
      </div>
    </ScreenLayout>
  );
}
