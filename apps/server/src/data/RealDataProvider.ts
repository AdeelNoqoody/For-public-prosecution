import type {
  DataProvider,
  PlateType,
  Service,
  ServiceResult,
  VehicleResult,
  Violation,
} from '@kiosk/shared';

/**
 * Adapter for the real back-office APIs. Implement each method by calling the upstream
 * service and mapping its response onto the shared types (validate with the Zod schemas
 * from @kiosk/shared). The kiosk UI needs no changes when this replaces MockDataProvider.
 */
export class RealDataProvider implements DataProvider {
  constructor(private readonly options: { baseUrl?: string; apiKey?: string } = {}) {}

  async lookupVehicle(_plateType: PlateType, _plateNumber: string): Promise<VehicleResult> {
    // TODO: call the vehicle registry API and the violations API, then combine the results.
    void this.options;
    throw new Error('RealDataProvider.lookupVehicle is not implemented');
  }

  async getViolations(_plateType: PlateType, _plateNumber: string): Promise<Violation[]> {
    // TODO: call the violations API; convert amounts to integer minor units (QAR × 100).
    throw new Error('RealDataProvider.getViolations is not implemented');
  }

  async getServices(): Promise<Service[]> {
    // TODO: load the service catalogue (or keep a static catalogue in config).
    throw new Error('RealDataProvider.getServices is not implemented');
  }

  async lookupService(_serviceId: string, _input: Record<string, string>): Promise<ServiceResult> {
    // TODO: route to the upstream API for each service id.
    throw new Error('RealDataProvider.lookupService is not implemented');
  }
}
