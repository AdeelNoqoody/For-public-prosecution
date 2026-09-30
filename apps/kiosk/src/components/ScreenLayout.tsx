import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, House } from 'lucide-react';
import { branding } from '../config/branding';
import { useI18n } from '../i18n/I18nProvider';
import { useSession } from '../state/session';
import { LanguageToggle } from './LanguageToggle';
import { Button } from './ui';

interface ScreenLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Primary action shown at the end of the footer. */
  action?: ReactNode;
  showBack?: boolean;
  showHome?: boolean;
  /** Content between the body and the footer, e.g. a sticky total bar. */
  bottomBar?: ReactNode;
}

export function AppHeader() {
  const { lt } = useI18n();
  return (
    <header className="flex h-[150px] shrink-0 items-center justify-between bg-brand px-12 text-on-brand">
      <div className="flex items-center gap-6">
        <img src={branding.logoSrc} alt="" className="size-[88px]" />
        <span className="text-3xl font-bold">{lt(branding.name)}</span>
      </div>
      <LanguageToggle />
    </header>
  );
}

export function ScreenLayout({
  title,
  subtitle,
  children,
  action,
  showBack = true,
  showHome = true,
  bottomBar,
}: ScreenLayoutProps) {
  const { t, dir } = useI18n();
  const { back, reset, history } = useSession();
  const BackIcon = dir === 'rtl' ? ArrowRight : ArrowLeft;

  return (
    <div className="flex h-full flex-col">
      <AppHeader />
      <div className="shrink-0 px-12 pt-10 pb-6">
        <h1 className="text-5xl leading-tight font-extrabold">{title}</h1>
        {subtitle && <p className="mt-3 text-2xl text-muted">{subtitle}</p>}
      </div>
      <main className="kiosk-scroll min-h-0 flex-1 overflow-y-auto px-12 pb-8">{children}</main>
      {bottomBar}
      <footer className="flex h-[180px] shrink-0 items-center gap-6 border-t-2 border-line bg-surface px-12">
        {showBack && history.length > 0 && (
          <Button
            variant="ghost"
            size="md"
            onClick={back}
            icon={<BackIcon className="size-9" />}
            data-testid="nav-back"
          >
            {t('common.back')}
          </Button>
        )}
        {showHome && (
          <Button
            variant="ghost"
            size="md"
            onClick={reset}
            icon={<House className="size-9" />}
            data-testid="nav-home"
          >
            {t('common.home')}
          </Button>
        )}
        <div className="flex min-w-0 flex-1 justify-end">{action}</div>
      </footer>
    </div>
  );
}
