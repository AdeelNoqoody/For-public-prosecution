import { Languages } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { cx } from './ui';

export function LanguageToggle({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const { t, toggleLang, lang } = useI18n();
  return (
    <button
      type="button"
      onClick={toggleLang}
      data-testid="language-toggle"
      lang={lang === 'en' ? 'ar' : 'en'}
      className={cx(
        'inline-flex min-h-[88px] min-w-[220px] items-center justify-center gap-3 rounded-full px-8 text-2xl font-bold',
        'transition-transform active:scale-[0.97]',
        tone === 'light'
          ? 'border-[3px] border-white/70 bg-white/10 text-white active:bg-white/25'
          : 'border-[3px] border-brand bg-surface text-brand active:bg-brand-soft',
      )}
    >
      <Languages className="size-9" aria-hidden />
      {t('language.switch')}
    </button>
  );
}
