import { z } from 'zod';
import { AmountMinorSchema, CurrencySchema } from './money';

/*
 * Generic POS contract used by the mock POS and the MockPosProvider adapter.
 * A real vendor adapter maps its own wire format onto the normalized types in
 * apps/server/src/pos/PosProvider.ts.
 * TODO(vendor): confirm field names, auth and signature scheme with the POS vendor.
 */

export const POS_RESULT_STATUSES = ['APPROVED', 'DECLINED', 'CANCELLED', 'ERROR'] as const;
export const PosResultStatusSchema = z.enum(POS_RESULT_STATUSES);
export type PosResultStatus = z.infer<typeof PosResultStatusSchema>;

export const PosTransactionStatusSchema = z.enum(['PENDING', ...POS_RESULT_STATUSES]);
export type PosTransactionStatus = z.infer<typeof PosTransactionStatusSchema>;

export const GenericPosCreateTransactionRequestSchema = z.object({
  amountMinor: AmountMinorSchema.positive(),
  currency: CurrencySchema,
  merchantReference: z.string().min(1).max(64),
  terminalId: z.string().min(1),
  callbackUrl: z.url(),
  description: z.string().max(128).optional(),
});
export type GenericPosCreateTransactionRequest = z.infer<
  typeof GenericPosCreateTransactionRequestSchema
>;

export const GenericPosTransactionSchema = z.object({
  transactionId: z.string(),
  merchantReference: z.string(),
  terminalId: z.string(),
  status: PosTransactionStatusSchema,
  amountMinor: AmountMinorSchema,
  currency: CurrencySchema,
  authCode: z.string().nullish(),
  maskedPan: z.string().nullish(),
  cardScheme: z.string().nullish(),
  reason: z.string().nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type GenericPosTransaction = z.infer<typeof GenericPosTransactionSchema>;

/** Body of POST /webhooks/pos sent by the (mock) POS provider. Signed with HMAC-SHA256. */
export const GenericPosWebhookPayloadSchema = z.object({
  eventId: z.string().min(1),
  transactionId: z.string().min(1),
  merchantReference: z.string().min(1),
  status: PosResultStatusSchema,
  amountMinor: AmountMinorSchema,
  currency: CurrencySchema,
  authCode: z.string().nullish(),
  maskedPan: z.string().nullish(),
  cardScheme: z.string().nullish(),
  reason: z.string().nullish(),
  /** ISO 8601 time the event was produced; used for replay protection. */
  timestamp: z.iso.datetime({ offset: true }),
});
export type GenericPosWebhookPayload = z.infer<typeof GenericPosWebhookPayloadSchema>;

export const SIGNATURE_HEADER = 'x-signature';

/** Masks a PAN so at most the last 4 digits are visible, whatever the provider sends. */
export function maskPan(pan: string | null | undefined): string | null {
  if (!pan) return null;
  const digits = pan.replace(/[^0-9]/g, '');
  if (digits.length < 4) return '****';
  return `**** **** **** ${digits.slice(-4)}`;
}
