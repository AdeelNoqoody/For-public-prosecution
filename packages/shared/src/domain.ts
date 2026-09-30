import { z } from 'zod';
import { LocalizedTextSchema } from './i18n';
import { AmountMinorSchema, CurrencySchema } from './money';
import { PlateTypeSchema } from './plate';

export const VehicleSchema = z.object({
  plateType: PlateTypeSchema,
  plateNumber: z.string(),
  make: z.string(),
  model: z.string(),
  year: z.number().int(),
  color: LocalizedTextSchema,
  ownerName: z.string().optional(),
  registrationExpiry: z.string().optional(),
});
export type Vehicle = z.infer<typeof VehicleSchema>;

export const ViolationSchema = z.object({
  id: z.string(),
  date: z.string(), // ISO 8601
  location: LocalizedTextSchema,
  description: LocalizedTextSchema,
  amountMinor: AmountMinorSchema,
  currency: CurrencySchema,
});
export type Violation = z.infer<typeof ViolationSchema>;

export const VehicleResultSchema = z.object({
  vehicle: VehicleSchema,
  violations: z.array(ViolationSchema),
});
export type VehicleResult = z.infer<typeof VehicleResultSchema>;

/** Something the user can put in the basket and pay for. */
export const PayableItemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['VIOLATION', 'SERVICE_FEE']),
  description: LocalizedTextSchema,
  amountMinor: AmountMinorSchema.positive(),
  currency: CurrencySchema,
});
export type PayableItem = z.infer<typeof PayableItemSchema>;

export const ServiceFieldSchema = z.object({
  id: z.string(),
  label: LocalizedTextSchema,
  keyboard: z.enum(['numeric', 'alphanumeric']),
  maxLength: z.number().int().positive(),
  /** Regex source the value must match. */
  pattern: z.string(),
  placeholder: z.string().optional(),
});
export type ServiceField = z.infer<typeof ServiceFieldSchema>;

export const ServiceSchema = z.object({
  id: z.string(),
  /** vehicle = plate entry flow, form = generic input form flow */
  flow: z.enum(['vehicle', 'form']),
  category: z.enum(['traffic', 'other']),
  icon: z.enum(['car', 'search', 'receipt', 'certificate', 'scale', 'document']),
  title: LocalizedTextSchema,
  description: LocalizedTextSchema,
  fields: z.array(ServiceFieldSchema),
});
export type Service = z.infer<typeof ServiceSchema>;

export const ServiceResultSchema = z.object({
  serviceId: z.string(),
  reference: z.string().optional(),
  title: LocalizedTextSchema,
  status: z
    .object({
      tone: z.enum(['info', 'success', 'warning', 'danger']),
      label: LocalizedTextSchema,
    })
    .optional(),
  rows: z.array(z.object({ label: LocalizedTextSchema, value: LocalizedTextSchema })),
  payableItems: z.array(PayableItemSchema),
});
export type ServiceResult = z.infer<typeof ServiceResultSchema>;
