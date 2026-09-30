import { useEffect } from 'react';
import { IdleOverlay } from './components/IdleOverlay';
import { ScaledStage } from './components/ScaledStage';
import { runtimeConfig } from './config/runtime';
import { useIdleTimer } from './hooks/useIdleTimer';
import { I18nProvider, useI18n } from './i18n/I18nProvider';
import { HomeScreen } from './screens/HomeScreen';
import { PaymentResultScreen } from './screens/PaymentResultScreen';
import { PaymentSummaryScreen } from './screens/PaymentSummaryScreen';
import { PaymentWaitingScreen } from './screens/PaymentWaitingScreen';
import { PlateEntryScreen } from './screens/PlateEntryScreen';
import { ServiceFormScreen } from './screens/ServiceFormScreen';
import { ServiceResultScreen } from './screens/ServiceResultScreen';
import { OtherServicesScreen, ServicesScreen } from './screens/ServicesScreen';
import { VehicleResultScreen } from './screens/VehicleResultScreen';
import { ServicesProvider } from './state/services';
import { SessionProvider, useSession, type Screen, type ScreenName } from './state/session';

/** Screens where the idle timer must not run: the attract screen and the whole payment phase. */
const IDLE_EXEMPT: ReadonlySet<ScreenName> = new Set(['home', 'paymentWaiting', 'paymentResult']);

function renderScreen(screen: Screen) {
  switch (screen.name) {
    case 'home':
      return <HomeScreen />;
    case 'services':
      return <ServicesScreen />;
    case 'otherServices':
      return <OtherServicesScreen />;
    case 'plateEntry':
      return <PlateEntryScreen serviceId={screen.serviceId} />;
    case 'vehicleResult':
      return <VehicleResultScreen serviceId={screen.serviceId} result={screen.result} />;
    case 'serviceForm':
      return <ServiceFormScreen serviceId={screen.serviceId} />;
    case 'serviceResult':
      return <ServiceResultScreen serviceId={screen.serviceId} result={screen.result} />;
    case 'paymentSummary':
      return <PaymentSummaryScreen />;
    case 'paymentWaiting':
      return <PaymentWaitingScreen initial={screen.payment} />;
    case 'paymentResult':
      return <PaymentResultScreen payment={screen.payment} />;
  }
}

function Kiosk() {
  const { screen, history, sessionId, busy, reset } = useSession();
  const { dir, setLang } = useI18n();
  const idleEnabled = !busy && !IDLE_EXEMPT.has(screen.name);
  const { idle, markActive } = useIdleTimer(runtimeConfig.idleTimeoutSeconds * 1000, idleEnabled);

  // A new session always starts in the default language.
  useEffect(() => setLang('en'), [sessionId, setLang]);

  return (
    <ScaledStage dir={dir}>
      <div key={`${sessionId}:${history.length}:${screen.name}`} className="screen-enter h-full">
        {renderScreen(screen)}
      </div>
      {idle && idleEnabled && <IdleOverlay onContinue={markActive} onTimeout={reset} />}
    </ScaledStage>
  );
}

export function App() {
  return (
    <I18nProvider>
      <SessionProvider>
        <ServicesProvider>
          <Kiosk />
        </ServicesProvider>
      </SessionProvider>
    </I18nProvider>
  );
}
