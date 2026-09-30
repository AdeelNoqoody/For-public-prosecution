import {
  ApiErrorSchema,
  CreatePaymentResponseSchema,
  PaymentViewSchema,
  ServiceLookupResponseSchema,
  ServicesResponseSchema,
  VehicleLookupResponseSchema,
  type CreatePaymentRequest,
  type CreatePaymentResponse,
  type PaymentView,
  type PlateType,
  type Service,
  type ServiceResult,
  type VehicleResult,
} from '@kiosk/shared';
import type { z } from 'zod';
import { runtimeConfig } from '../config/runtime';

export class ApiRequestError extends Error {
  constructor(
    readonly code:
      | 'NETWORK'
      | 'NOT_FOUND'
      | 'VALIDATION_ERROR'
      | 'POS_UNAVAILABLE'
      | 'INVALID_RESPONSE'
      | string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

const REQUEST_TIMEOUT_MS = 20_000;

async function request<T extends z.ZodType>(
  path: string,
  schema: T,
  init: { method?: 'GET' | 'POST'; body?: unknown; headers?: Record<string, string> } = {},
): Promise<z.infer<T>> {
  let response: Response;
  try {
    response = await fetch(`${runtimeConfig.serverUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        accept: 'application/json',
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ApiRequestError(
      'NETWORK',
      0,
      error instanceof Error ? error.message : 'Network error',
    );
  }

  const json: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(json);
    throw new ApiRequestError(
      parsed.success ? parsed.data.error.code : `HTTP_${response.status}`,
      response.status,
      parsed.success ? parsed.data.error.message : response.statusText,
    );
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiRequestError(
      'INVALID_RESPONSE',
      response.status,
      'Unexpected response from server',
    );
  }
  return parsed.data;
}

/** Typed client for the kiosk backend. The UI only depends on this, never on data sources. */
export const api = {
  async getServices(): Promise<Service[]> {
    return (await request('/api/services', ServicesResponseSchema)).services;
  },

  lookupVehicle(plateType: PlateType, plateNumber: string): Promise<VehicleResult> {
    return request('/api/vehicles/lookup', VehicleLookupResponseSchema, {
      method: 'POST',
      body: { plateType, plateNumber },
    });
  },

  lookupService(serviceId: string, input: Record<string, string>): Promise<ServiceResult> {
    return request(
      `/api/services/${encodeURIComponent(serviceId)}/lookup`,
      ServiceLookupResponseSchema,
      {
        method: 'POST',
        body: { input },
      },
    );
  },

  createPayment(
    body: CreatePaymentRequest,
    idempotencyKey: string,
  ): Promise<CreatePaymentResponse> {
    return request('/api/payments', CreatePaymentResponseSchema, {
      method: 'POST',
      body,
      headers: { 'idempotency-key': idempotencyKey },
    });
  },

  getPayment(paymentId: string): Promise<PaymentView> {
    return request(`/api/payments/${encodeURIComponent(paymentId)}`, PaymentViewSchema);
  },

  cancelPayment(paymentId: string): Promise<PaymentView> {
    return request(`/api/payments/${encodeURIComponent(paymentId)}/cancel`, PaymentViewSchema, {
      method: 'POST',
      body: {},
    });
  },
};

export function errorMessageKey(error: unknown) {
  if (error instanceof ApiRequestError) {
    if (error.code === 'NETWORK') return 'error.network' as const;
    if (error.code === 'NOT_FOUND') return 'error.notFound' as const;
    if (error.code === 'VALIDATION_ERROR') return 'error.validation' as const;
    if (error.code === 'AMOUNT_LIMIT_EXCEEDED') return 'error.amountLimit' as const;
  }
  return 'error.generic' as const;
}
