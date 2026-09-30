import { useI18n } from '../i18n/I18nProvider';

/** Sticky bar above the footer showing the running total. */
export function TotalBar({ amountMinor, caption }: { amountMinor: number; caption?: string }) {
  const { t, formatMoney } = useI18n();
  return (
    <div className="flex shrink-0 items-center justify-between border-t-2 border-line bg-brand-soft px-12 py-7">
      <div>
        <p className="text-2xl font-bold text-muted">{t('common.total')}</p>
        {caption && <p className="text-xl text-muted">{caption}</p>}
      </div>
      <p className="text-6xl font-extrabold text-brand tabular-nums" data-testid="total-amount">
        {formatMoney(amountMinor)}
      </p>
    </div>
  );
}
