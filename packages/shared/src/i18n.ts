import { z } from 'zod';

export const LANGUAGES = ['en', 'ar'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Text supplied by the backend in every supported language. */
export const LocalizedTextSchema = z.object({
  en: z.string(),
  ar: z.string(),
});
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;
