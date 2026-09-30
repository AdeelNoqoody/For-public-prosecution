import type { LocalizedText } from '@kiosk/shared';
import logoSrc from '../assets/logo.svg';

/**
 * All branding lives here: name, logo and colours. Neutral placeholders only —
 * replace with the deploying organisation's approved assets.
 */
export const branding = {
  name: { en: 'Self-Service Kiosk', ar: 'جهاز الخدمة الذاتية' } satisfies LocalizedText,
  tagline: {
    en: 'Pay fines and fees in a few taps',
    ar: 'ادفع المخالفات والرسوم بلمسات قليلة',
  } satisfies LocalizedText,
  logoSrc,
  supportPhone: '+000 0000 0000',
  colors: {
    primary: '#7a1e2b',
    primaryDark: '#571018',
    primarySoft: '#f4e3e5',
    onPrimary: '#ffffff',
    accent: '#c39a45',
    background: '#f6f1e8',
    surface: '#ffffff',
    text: '#2a141a',
    muted: '#6b5157',
    line: '#e2d6cc',
    success: '#16794c',
    successSoft: '#e1f3ea',
    danger: '#b3261e',
    dangerSoft: '#fbe6e4',
    warning: '#94600b',
    warningSoft: '#fdf0d8',
  },
} as const;

/** Exposes the palette as CSS variables consumed by the Tailwind theme in index.css. */
export function applyBrandingTheme(root: HTMLElement = document.documentElement): void {
  const toKebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  for (const [key, value] of Object.entries(branding.colors)) {
    root.style.setProperty(`--brand-${toKebab(key)}`, value);
  }
}
