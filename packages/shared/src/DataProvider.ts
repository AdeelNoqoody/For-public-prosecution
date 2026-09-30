import type { Service, ServiceResult, VehicleResult, Violation } from './domain';
import type { PlateType } from './plate';

/**
 * Source of lookup data (vehicles, violations, services).
 * The server picks an implementation via DATA_PROVIDER=mock|real; the kiosk never
 * talks to a DataProvider directly, so swapping implementations needs no UI changes.
 */
export interface DataProvider {
  lookupVehicle(plateType: PlateType, plateNumber: string): Promise<VehicleResult>;
  getViolations(plateType: PlateType, plateNumber: string): Promise<Violation[]>;
  getServices(): Promise<Service[]>;
  lookupService(serviceId: string, input: Record<string, string>): Promise<ServiceResult>;
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}
