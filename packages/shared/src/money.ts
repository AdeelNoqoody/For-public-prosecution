import { z } from 'zod';

/**
 * All amounts are integer minor units to avoid floating point errors.
 * QAR has 2 decimals: 1 QAR = 100 dirhams, so 150.50 QAR === 15050.
 */
export const CurrencySchema = z.literal('QAR');
export type Currency = z.infer<typeof CurrencySchema>;

export const AmountMinorSchema = z.number().int().nonnegative();

export const MINOR_UNITS_PER_MAJOR = 100;

export function toMajor(amountMinor: number): number {
  return amountMinor / MINOR_UNITS_PER_MAJOR;
}

export function toMinor(amountMajor: number): number {
  return Math.round(amountMajor * MINOR_UNITS_PER_MAJOR);
}

export function sumMinor(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}
