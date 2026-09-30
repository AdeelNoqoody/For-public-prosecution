import {
  ServiceResultSchema,
  ServiceSchema,
  VehicleResultSchema,
  ValidationError,
  NotFoundError,
} from '@kiosk/shared';
import { describe, expect, it } from 'vitest';
import { MockDataProvider } from '../src/data/MockDataProvider';
import { createTestApp } from './helpers';

const data = new MockDataProvider({ latencyMinMs: 0, latencyMaxMs: 0 });

describe('MockDataProvider', () => {
  it('returns the same static vehicle result for any plate, echoing the plate', async () => {
    const a = await data.lookupVehicle('PRIVATE', '123');
    const b = await data.lookupVehicle('TAXI', '987654');

    expect(VehicleResultSchema.safeParse(a).success).toBe(true);
    expect(a.vehicle).toMatchObject({
      make: 'Toyota',
      model: 'Land Cruiser',
      plateType: 'PRIVATE',
      plateNumber: '123',
    });
    expect(b.vehicle).toMatchObject({ plateType: 'TAXI', plateNumber: '987654' });
    expect(a.violations.map((v) => v.id)).toEqual(b.violations.map((v) => v.id));
    expect(a.violations.length).toBeGreaterThanOrEqual(2);
    expect(a.violations.length).toBeLessThanOrEqual(4);
    expect(a.violations.every((v) => Number.isInteger(v.amountMinor) && v.amountMinor > 0)).toBe(
      true,
    );
  });

  it('returns independent copies (callers cannot mutate the fixtures)', async () => {
    const first = await data.getViolations('PRIVATE', '1');
    first[0]!.amountMinor = 1;
    const second = await data.getViolations('PRIVATE', '1');
    expect(second[0]!.amountMinor).not.toBe(1);
  });

  it('lists valid services, including vehicle and form flows', async () => {
    const services = await data.getServices();
    for (const service of services) expect(ServiceSchema.safeParse(service).success).toBe(true);
    expect(services.map((s) => s.id)).toEqual(
      expect.arrayContaining([
        'traffic-violations',
        'vehicle-inquiry',
        'fee-lookup',
        'certificate-request',
        'case-status',
      ]),
    );
  });

  it('fills service result templates from the input with a deterministic reference', async () => {
    const result = await data.lookupService('fee-lookup', { referenceNumber: '12345678' });
    expect(ServiceResultSchema.safeParse(result).success).toBe(true);
    expect(result.reference).toMatch(/^REF-\d{8}$/);
    expect(result.rows[0]?.value.en).toBe('12345678');
    expect(result.payableItems).toEqual([
      expect.objectContaining({ id: 'FEE-12345678', amountMinor: 100 }),
    ]);

    const again = await data.lookupService('fee-lookup', { referenceNumber: '12345678' });
    expect(again.reference).toBe(result.reference);
  });

  it('returns status-only results with nothing to pay', async () => {
    const result = await data.lookupService('case-status', { caseNumber: 'cs-2026-1' });
    expect(result.payableItems).toEqual([]);
    expect(result.rows[0]?.value.en).toBe('CS-2026-1'); // normalised to upper case
  });

  it('validates input against the service field patterns', async () => {
    await expect(
      data.lookupService('certificate-request', { idNumber: '123' }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      data.lookupService('case-status', { caseNumber: 'bad value!' }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(data.lookupService('traffic-violations', {})).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(data.lookupService('does-not-exist', {})).rejects.toBeInstanceOf(NotFoundError);
  });

  it('simulates latency within the configured range', async () => {
    const slow = new MockDataProvider({ latencyMinMs: 40, latencyMaxMs: 80 });
    const start = performance.now();
    await slow.getServices();
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(35);
    expect(elapsed).toBeLessThan(400);
  });
});

describe('data routes', () => {
  it('serve the provider over HTTP with validation', async () => {
    const t = await createTestApp();
    try {
      const ok = await t.app.inject({
        method: 'POST',
        url: '/api/vehicles/lookup',
        payload: { plateType: 'PRIVATE', plateNumber: '5555' },
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().vehicle.plateNumber).toBe('5555');

      const invalid = await t.app.inject({
        method: 'POST',
        url: '/api/vehicles/lookup',
        payload: { plateType: 'PRIVATE', plateNumber: '0abc' },
      });
      expect(invalid.statusCode).toBe(400);

      const service = await t.app.inject({
        method: 'POST',
        url: '/api/services/nope/lookup',
        payload: { input: {} },
      });
      expect(service.statusCode).toBe(404);
    } finally {
      await t.app.close();
    }
  });
});
