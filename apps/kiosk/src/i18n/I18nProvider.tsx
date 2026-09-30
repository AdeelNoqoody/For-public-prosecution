import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { toMajor, type Language, type LocalizedText } from '@kiosk/shared';
import { messages, type MessageKey } from './messages';

interface I18nValue {
  lang: Language;
  dir: 'ltr' | 'rtl';
  setLang(lang: Language): void;
  toggleLang(): void;
  t(key: MessageKey, vars?: Record<string, string | number>): string;
  /** Picks the current language from backend-provided text. */
  lt(text: LocalizedText): string;
  formatMoney(amountMinor: number, currency?: string): string;
  formatDate(iso: string): string;
  formatDateTime(iso: string): string;
}

const I18nContext = createContext<I18nValue | null>(null);

// Latin digits in both languages (numbering system "latn") for plates, amounts and references.
const LOCALES: Record<Language, string> = { en: 'en-GB-u-nu-latn', ar: 'ar-QA-u-nu-latn' };

export function I18nProvider({
  children,
  initial = 'en',
}: {
  children: ReactNode;
  initial?: Language;
}) {
  const [lang, setLang] = useState<Language>(initial);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const toggleLang = useCallback(() => setLang((current) => (current === 'en' ? 'ar' : 'en')), []);

  const value = useMemo<I18nValue>(() => {
    const locale = LOCALES[lang];
    const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
    const dateTimeFmt = new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    return {
      lang,
      dir,
      setLang,
      toggleLang,
      t: (key, vars) => {
        const template: string = messages[lang][key] ?? messages.en[key] ?? key;
        if (!vars) return template;
        return template.replace(/\{(\w+)\}/g, (_, name: string) =>
          String(vars[name] ?? `{${name}}`),
        );
      },
      lt: (text) => text[lang] || text.en,
      formatMoney: (amountMinor, currency = 'QAR') =>
        new Intl.NumberFormat(locale, {
          style: 'currency',
          currency,
          minimumFractionDigits: 2,
        }).format(toMajor(amountMinor)),
      formatDate: (iso) => dateFmt.format(new Date(iso)),
      formatDateTime: (iso) => dateTimeFmt.format(new Date(iso)),
    };
  }, [lang, dir, toggleLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}
