import type { FastifyInstance } from 'fastify';
import {
  ServiceLookupRequestSchema,
  VehicleLookupRequestSchema,
  type DataProvider,
} from '@kiosk/shared';
import { z } from 'zod';

export function registerDataRoutes(app: FastifyInstance, data: DataProvider): void {
  app.get('/api/services', async () => ({ services: await data.getServices() }));

  app.post('/api/vehicles/lookup', async (request) => {
    const { plateType, plateNumber } = VehicleLookupRequestSchema.parse(request.body);
    return data.lookupVehicle(plateType, plateNumber);
  });

  app.post('/api/services/:serviceId/lookup', async (request) => {
    const { serviceId } = z.object({ serviceId: z.string().min(1).max(64) }).parse(request.params);
    const { input } = ServiceLookupRequestSchema.parse(request.body);
    return data.lookupService(serviceId, input);
  });
}
