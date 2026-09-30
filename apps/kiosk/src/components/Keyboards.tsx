import { Delete } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { cx } from './ui';

interface KeyboardProps {
  onKey(char: string): void;
  onBackspace(): void;
  onClear(): void;
  disabled?: boolean;
}

const KEY_BASE =
  'flex select-none items-center justify-center rounded-2xl border-2 border-line bg-surface font-bold text-ink shadow-sm ' +
  'transition-transform duration-75 active:scale-95 active:bg-brand-soft disabled:opacity-40';

/** Large 3×4 numeric keypad. Always laid out left-to-right, like a phone keypad. */
export function NumericKeypad({ onKey, onBackspace, onClear, disabled }: KeyboardProps) {
  const { t } = useI18n();
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  return (
    <div dir="ltr" className="grid grid-cols-3 gap-5" data-testid="numeric-keypad">
      {digits.map((digit) => (
        <button
          key={digit}
          type="button"
          disabled={disabled}
          className={cx(KEY_BASE, 'h-[128px] text-6xl')}
          onClick={() => onKey(digit)}
          data-testid={`key-${digit}`}
        >
          {digit}
        </button>
      ))}
      <button
        type="button"
        disabled={disabled}
        className={cx(KEY_BASE, 'h-[128px] text-2xl text-muted')}
        onClick={onClear}
      >
        {t('common.clear')}
      </button>
      <button
        type="button"
        disabled={disabled}
        className={cx(KEY_BASE, 'h-[128px] text-6xl')}
        onClick={() => onKey('0')}
        data-testid="key-0"
      >
        0
      </button>
      <button
        type="button"
        disabled={disabled}
        className={cx(KEY_BASE, 'h-[128px] text-muted')}
        onClick={onBackspace}
        aria-label={t('common.delete')}
        data-testid="key-backspace"
      >
        <Delete className="size-16" aria-hidden />
      </button>
    </div>
  );
}

const ALPHA_ROWS = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM-'];

/** On-screen alphanumeric keyboard (uppercase Latin + digits + dash) for reference numbers. */
export function AlphaKeyboard({ onKey, onBackspace, onClear, disabled }: KeyboardProps) {
  const { t } = useI18n();
  return (
    <div dir="ltr" className="flex flex-col gap-4" data-testid="alpha-keyboard">
      {ALPHA_ROWS.map((row) => (
        <div key={row} className="flex justify-center gap-3">
          {row.split('').map((char) => (
            <button
              key={char}
              type="button"
              disabled={disabled}
              className={cx(KEY_BASE, 'h-[120px] w-[90px] text-4xl')}
              onClick={() => onKey(char)}
              data-testid={`key-${char}`}
            >
              {char}
            </button>
          ))}
        </div>
      ))}
      <div className="flex justify-center gap-3">
        <button
          type="button"
          disabled={disabled}
          className={cx(KEY_BASE, 'h-[120px] w-[300px] text-2xl text-muted')}
          onClick={onClear}
        >
          {t('common.clear')}
        </button>
        <button
          type="button"
          disabled={disabled}
          className={cx(KEY_BASE, 'h-[120px] w-[300px] text-muted')}
          onClick={onBackspace}
          aria-label={t('common.delete')}
          data-testid="key-backspace"
        >
          <Delete className="size-14" aria-hidden />
        </button>
      </div>
    </div>
  );
}
