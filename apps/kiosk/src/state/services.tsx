import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Service } from '@kiosk/shared';
import { api } from '../api/client';

interface ServicesValue {
  services: Service[];
  loading: boolean;
  error: unknown;
  reload(): void;
  find(serviceId: string): Service | undefined;
}

const ServicesContext = createContext<ServicesValue | null>(null);

/** Service catalogue, loaded once and retried automatically if the server is not reachable yet. */
export function ServicesProvider({ children }: { children: ReactNode }) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .getServices()
      .then((list) => {
        if (cancelled) return;
        setServices(list);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err);
        setLoading(false);
        // Kiosk may boot before the server: keep retrying in the background.
        setTimeout(() => !cancelled && setAttempt((n) => n + 1), 5000);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => {
    setLoading(true);
    setAttempt((n) => n + 1);
  }, []);
  const find = useCallback((id: string) => services.find((s) => s.id === id), [services]);

  return (
    <ServicesContext.Provider value={{ services, loading, error, reload, find }}>
      {children}
    </ServicesContext.Provider>
  );
}

export function useServices(): ServicesValue {
  const value = useContext(ServicesContext);
  if (!value) throw new Error('useServices must be used inside ServicesProvider');
  return value;
}
