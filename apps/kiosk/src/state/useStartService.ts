import { useCallback } from 'react';
import type { Service } from '@kiosk/shared';
import { useSession } from './session';

/** Opens the right first screen for a service (plate entry or generic form). */
export function useStartService() {
  const { navigate } = useSession();
  return useCallback(
    (service: Service) =>
      navigate(
        service.flow === 'vehicle'
          ? { name: 'plateEntry', serviceId: service.id }
          : { name: 'serviceForm', serviceId: service.id },
      ),
    [navigate],
  );
}
