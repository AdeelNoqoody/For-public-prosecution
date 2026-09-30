import type { ReactNode } from 'react';
import { errorMessageKey } from '../api/client';
import { ScreenLayout } from '../components/ScreenLayout';
import { ServiceTile } from '../components/ServiceTile';
import { Button, ErrorBanner, Spinner } from '../components/ui';
import { useI18n } from '../i18n/I18nProvider';
import { useServices } from '../state/services';
import { useSession } from '../state/session';
import { useStartService } from '../state/useStartService';

function ServicesState({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { services, loading, error, reload } = useServices();
  if (loading && services.length === 0)
    return <Spinner label={t('common.loading')} className="h-full" />;
  if (error && services.length === 0) {
    return (
      <ErrorBanner
        message={t(errorMessageKey(error))}
        action={
          <Button size="md" variant="danger" onClick={reload}>
            {t('common.retry')}
          </Button>
        }
      />
    );
  }
  return <>{children}</>;
}

/** Top-level service selection: the traffic services plus an "Other services" group. */
export function ServicesScreen() {
  const { t, lt } = useI18n();
  const { services } = useServices();
  const { navigate } = useSession();
  const startService = useStartService();
  const traffic = services.filter((s) => s.category === 'traffic');

  return (
    <ScreenLayout title={t('services.title')} subtitle={t('services.subtitle')}>
      <ServicesState>
        <div className="flex flex-col gap-8">
          {traffic.map((service) => (
            <ServiceTile
              key={service.id}
              icon={service.icon}
              title={lt(service.title)}
              description={lt(service.description)}
              onSelect={() => startService(service)}
              testId={`service-${service.id}`}
            />
          ))}
          <ServiceTile
            icon="grid"
            title={t('services.other')}
            description={t('services.otherDescription')}
            onSelect={() => navigate({ name: 'otherServices' })}
            testId="service-other"
          />
        </div>
      </ServicesState>
    </ScreenLayout>
  );
}

export function OtherServicesScreen() {
  const { t, lt } = useI18n();
  const { services } = useServices();
  const startService = useStartService();
  const others = services.filter((s) => s.category === 'other');

  return (
    <ScreenLayout title={t('services.otherTitle')}>
      <ServicesState>
        <div className="flex flex-col gap-8">
          {others.map((service) => (
            <ServiceTile
              key={service.id}
              icon={service.icon}
              title={lt(service.title)}
              description={lt(service.description)}
              onSelect={() => startService(service)}
              testId={`service-${service.id}`}
            />
          ))}
        </div>
      </ServicesState>
    </ScreenLayout>
  );
}
