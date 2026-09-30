import { z } from 'zod';

export const PLATE_TYPES = [
  'PRIVATE',
  'TRANSPORT',
  'MOTORCYCLE',
  'TAXI',
  'HEAVY_EQUIPMENT',
  'EXPORT',
] as const;

export const PlateTypeSchema = z.enum(PLATE_TYPES);
export type PlateType = z.infer<typeof PlateTypeSchema>;

/** Placeholder rules: numeric plates, 1–6 digits, no leading zero. Adjust per real registry. */
export const PLATE_NUMBER_MAX_LENGTH = 6;
export const PLATE_NUMBER_PATTERN = /^[1-9][0-9]{0,5}$/;

export const PlateNumberSchema = z
  .string()
  .trim()
  .regex(PLATE_NUMBER_PATTERN, 'Plate number must be 1–6 digits and cannot start with 0');

export function isValidPlateNumber(value: string): boolean {
  return PlateNumberSchema.safeParse(value).success;
}
