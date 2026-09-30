import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Service } from '@kiosk/shared';
import { useI18n } from '../i18n/I18nProvider';
import { ServiceIcon } from './ServiceIcon';
import { cx } from './ui';

interface ServiceTileProps {
  icon: Service['icon'] | 'grid';
  title: string;
  description?: string;
  onSelect(): void;
  compact?: boolean;
  testId?: string;
}

/** Large tappable service card. */
export function ServiceTile({
  icon,
  title,
  description,
  onSelect,
  compact,
  testId,
}: ServiceTileProps) {
  const { dir } = useI18n();
  const Chevron = dir === 'rtl' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={testId}
      className={cx(
        'flex w-full items-center gap-8 rounded-[2rem] border-2 border-line bg-surface text-start shadow-sm',
        'transition-transform duration-100 active:scale-[0.985] active:border-brand active:bg-brand-soft',
        compact
          ? 'min-h-[200px] flex-col justify-center gap-3 px-5 py-5 text-center'
          : 'min-h-[220px] px-10 py-8',
      )}
    >
      <span
        className={cx(
          'flex shrink-0 items-center justify-center rounded-3xl bg-brand-soft text-brand',
          compact ? 'size-[80px]' : 'size-[132px]',
        )}
      >
        <ServiceIcon icon={icon} className={compact ? 'size-12' : 'size-[4.5rem]'} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <span className={cx('font-extrabold', compact ? 'text-xl leading-snug' : 'text-4xl')}>
          {title}
        </span>
        {description && !compact && <span className="text-2xl text-muted">{description}</span>}
      </span>
      {!compact && <Chevron className="size-14 shrink-0 text-muted" aria-hidden />}
    </button>
  );
}
