import { z } from 'zod';
import {
  PayableItemSchema,
  ServiceResultSchema,
  ServiceSchema,
  VehicleResultSchema,
} from './domain';
import { AmountMinorSchema, CurrencySchema } from './money';
import { PaymentStatusSchema } from './paymentStatus';
import { PlateNumberSchema, PlateTypeSchema } from './plate';

/* ─── Kiosk ⇄ server REST contract ────────────────────────────── */

export const VehicleLookupRequestSchema = z.object({
  plateType: PlateTypeSchema,
  plateNumber: PlateNumberSchema,
});
export type VehicleLookupRequest = z.infer<typeof VehicleLookupRequestSchema>;

export const VehicleLookupResponseSchema = VehicleResultSchema;

export const ServicesResponseSchema = z.object({ services: z.array(ServiceSchema) });

export const ServiceLookupRequestSchema = z.object({
  input: z.record(z.string(), z.string().max(64)),
});
export type ServiceLookupRequest = z.infer<typeof ServiceLookupRequestSchema>;

export const ServiceLookupResponseSchema = ServiceResultSchema;

export const CreatePaymentRequestSchema = z
  .object({
    kioskId: z.string().min(1).max(64),
    items: z.array(PayableItemSchema).min(1).max(50),
    amountMinor: AmountMinorSchema.positive(),
    currency: CurrencySchema,
  })
  .refine((body) => body.items.every((item) => item.currency === body.currency), {
    message: 'All items must use the payment currency',
    path: ['items'],
  })
  .refine(
    (body) => body.items.reduce((sum, item) => sum + item.amountMinor, 0) === body.amountMinor,
    { message: 'amountMinor must equal the sum of item amounts', path: ['amountMinor'] },
  )
  .refine((body) => new Set(body.items.map((item) => item.id)).size === body.items.length, {
    message: 'Duplicate item ids',
    path: ['items'],
  });
export type CreatePaymentRequest = z.infer<typeof CreatePaymentRequestSchema>;

/** Public view of a payment. Never contains sensitive card data (only a masked PAN). */
export const PaymentViewSchema = z.object({
  paymentId: z.string(),
  kioskId: z.string(),
  status: PaymentStatusSchema,
  amountMinor: AmountMinorSchema,
  currency: CurrencySchema,
  items: z.array(PayableItemSchema),
  merchantReference: z.string(),
  posTransactionId: z.string().nullable(),
  receiptNumber: z.string().nullable(),
  authCode: z.string().nullable(),
  maskedPan: z.string().nullable(),
  cardScheme: z.string().nullable(),
  failureReason: z.string().nullable(),
  rrn: z.string().nullable(),
  pun: z.string().nullable(),
  terminalId: z.string().nullable(),
  errorCode: z.string().nullable(),
  customerMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  expiresAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});
export type PaymentView = z.infer<typeof PaymentViewSchema>;

export const CreatePaymentResponseSchema = z.object({
  paymentId: z.string(),
  payment: PaymentViewSchema,
});
export type CreatePaymentResponse = z.infer<typeof CreatePaymentResponseSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/* ─── Server → kiosk WebSocket messages (ws://server/payments/:paymentId) ── */

export const PaymentSocketMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('payment.snapshot'), payment: PaymentViewSchema }),
  z.object({ type: z.literal('payment.updated'), payment: PaymentViewSchema }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
]);
export type PaymentSocketMessage = z.infer<typeof PaymentSocketMessageSchema>;
