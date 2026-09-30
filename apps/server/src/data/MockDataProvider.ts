import { createHash } from 'node:crypto';
import {
  NotFoundError,
  ServiceResultSchema,
  ServiceSchema,
  ValidationError,
  VehicleSchema,
  ViolationSchema,
  type DataProvider,
  type PlateType,
  type Service,
  type ServiceResult,
  type VehicleResult,
  type Violation,
} from '@kiosk/shared';
import { z } from 'zod';
import serviceResultFixtures from '../mock/fixtures/service-results.json';
import servicesFixture from '../mock/fixtures/services.json';
import vehicleFixture from '../mock/fixtures/vehicle.json';
import violationsFixture from '../mock/fixtures/violations.json';

// Validate fixtures once at load so a typo fails fast instead of at request time.
const services = z.array(ServiceSchema).parse(servicesFixture);
const violations = z.array(ViolationSchema).parse(violationsFixture);
const vehicleBase = VehicleSchema.omit({ plateType: true, plateNumber: true }).parse(
  vehicleFixture,
);
const serviceResultTemplates = z
  .record(z.string(), ServiceResultSchema.omit({ serviceId: true, reference: true }))
  .parse(serviceResultFixtures);

export interface MockDataProviderOptions {
  latencyMinMs?: number;
  latencyMaxMs?: number;
}

/**
 * Fixture-backed provider. Any plate returns the same static vehicle + violations;
 * other services return templated dummy results.
 */
export class MockDataProvider implements DataProvider {
  private readonly latencyMinMs: number;
  private readonly latencyMaxMs: number;

  constructor(options: MockDataProviderOptions = {}) {
    this.latencyMinMs = options.latencyMinMs ?? 300;
    this.latencyMaxMs = Math.max(this.latencyMinMs, options.latencyMaxMs ?? 800);
  }

  async lookupVehicle(plateType: PlateType, plateNumber: string): Promise<VehicleResult> {
    await this.simulateLatency();
    return {
      vehicle: { ...vehicleBase, plateType, plateNumber },
      violations: structuredClone(violations),
    };
  }

  async getViolations(_plateType: PlateType, _plateNumber: string): Promise<Violation[]> {
    await this.simulateLatency();
    return structuredClone(violations);
  }

  async getServices(): Promise<Service[]> {
    await this.simulateLatency();
    return structuredClone(services);
  }

  async lookupService(serviceId: string, input: Record<string, string>): Promise<ServiceResult> {
    await this.simulateLatency();
    const service = services.find((s) => s.id === serviceId);
    if (!service) throw new NotFoundError(`Unknown service ${serviceId}`);
    const template = serviceResultTemplates[serviceId];
    if (service.flow !== 'form' || !template) {
      throw new ValidationError(`Service ${serviceId} does not support lookups`);
    }

    const values: Record<string, string> = {};
    for (const field of service.fields) {
      const value = (input[field.id] ?? '').trim().toUpperCase();
      if (!new RegExp(field.pattern).test(value)) {
        throw new ValidationError(`Invalid value for ${field.id}`, { field: field.id });
      }
      values[field.id] = value;
    }

    // Deterministic fake reference so the same input yields the same result.
    const digest = createHash('sha256')
      .update(`${serviceId}:${JSON.stringify(values)}`)
      .digest('hex');
    const reference = `REF-${parseInt(digest.slice(0, 10), 16).toString().slice(0, 8).padStart(8, '0')}`;
    const fill = (text: string) =>
      text
        .replaceAll('{{reference}}', reference)
        .replace(/\{\{input\.([a-zA-Z0-9_]+)\}\}/g, (_, key: string) => values[key] ?? '');
    const filled = JSON.parse(fill(JSON.stringify(template))) as typeof template;
    return ServiceResultSchema.parse({ ...filled, serviceId, reference });
  }

  private async simulateLatency(): Promise<void> {
    if (this.latencyMaxMs <= 0) return;
    const ms = this.latencyMinMs + Math.random() * (this.latencyMaxMs - this.latencyMinMs);
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
