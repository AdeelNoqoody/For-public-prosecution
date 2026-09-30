import type { PlateType } from '@kiosk/shared';
import { useI18n } from '../i18n/I18nProvider';
import { plateTypeKey } from '../i18n/messages';

/** Stylised number plate. */
export function PlateBadge({
  plateType,
  plateNumber,
}: {
  plateType: PlateType;
  plateNumber: string;
}) {
  const { t } = useI18n();
  return (
    <div
      dir="ltr"
      className="inline-flex h-[104px] shrink-0 items-stretch overflow-hidden rounded-2xl border-[4px] border-ink bg-white text-ink shadow-sm"
      data-testid="plate-badge"
    >
      <span className="flex items-center bg-brand px-5 text-lg font-bold text-on-brand">
        {t(plateTypeKey(plateType))}
      </span>
      <span className="flex items-center px-7 text-5xl font-extrabold tracking-[0.12em] tabular-nums">
        {plateNumber}
      </span>
    </div>
  );
}
