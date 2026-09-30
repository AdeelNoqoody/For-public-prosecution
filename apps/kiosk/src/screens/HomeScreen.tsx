import { CreditCard, Hand } from 'lucide-react';
import { errorMessageKey } from '../api/client';
import { LanguageToggle } from '../components/LanguageToggle';
import { ServiceTile } from '../components/ServiceTile';
import { Button, ErrorBanner, Spinner } from '../components/ui';
import { branding } from '../config/branding';
import { useI18n } from '../i18n/I18nProvider';
import { useServices } from '../state/services';
import { useSession } from '../state/session';
import { useStartService } from '../state/useStartService';

/** Attract / home screen. */
export function HomeScreen() {
  const { t, lt } = useI18n();
  const { navigate } = useSession();
  const { services, loading, error, reload } = useServices();
  const startService = useStartService();

  return (
    <div className="relative flex h-full flex-col bg-gradient-to-b from-brand-dark via-brand to-brand text-on-brand">
      <div
        className="attract-glow pointer-events-none absolute inset-x-0 top-0 h-[1100px]"
        aria-hidden
      />

      <div className="relative flex justify-end px-12 pt-10">
        <LanguageToggle />
      </div>

      <section className="relative flex flex-col items-center px-16 pt-4 text-center">
        <img src={branding.logoSrc} alt="" className="size-[150px]" />
        <p className="mt-8 text-4xl font-semibold opacity-85">{t('home.welcome')}</p>
        <h1 className="mt-2 text-6xl leading-tight font-extrabold">{lt(branding.name)}</h1>
        <p className="mt-5 text-3xl opacity-85">{lt(branding.tagline)}</p>

        <Button
          size="xl"
          className="start-pulse mt-10 min-w-[640px] bg-surface text-4xl !text-brand shadow-2xl active:!bg-brand-soft"
          icon={<Hand className="size-14" />}
          onClick={() => navigate({ name: 'services' })}
          data-testid="start-button"
        >
          {t('home.start')}
        </Button>
      </section>

      <section className="relative mt-auto rounded-t-[3.5rem] bg-canvas px-12 pt-10 pb-8 text-ink">
        <h2 className="mb-6 text-3xl font-extrabold">{t('home.servicesTitle')}</h2>
        {loading && services.length === 0 ? (
          <Spinner className="h-[420px]" />
        ) : error && services.length === 0 ? (
          <ErrorBanner
            message={t(errorMessageKey(error))}
            action={
              <Button size="md" variant="danger" onClick={reload}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-3 gap-5">
            {services.slice(0, 6).map((service) => (
              <ServiceTile
                key={service.id}
                compact
                icon={service.icon}
                title={lt(service.title)}
                onSelect={() => startService(service)}
                testId={`home-service-${service.id}`}
              />
            ))}
          </div>
        )}
        <p className="mt-7 flex items-center justify-center gap-4 text-2xl text-muted">
          <CreditCard className="size-9" aria-hidden />
          {t('home.cardOnly')}
        </p>
      </section>
    </div>
  );
}
