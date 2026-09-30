import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { LoaderCircle, TriangleAlert } from 'lucide-react';

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'md' | 'lg' | 'xl';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-on-brand shadow-lg shadow-brand/25 active:bg-brand-dark',
  secondary: 'bg-surface text-brand border-[3px] border-brand active:bg-brand-soft',
  ghost: 'bg-transparent text-ink border-[3px] border-line active:bg-line/40',
  danger: 'bg-surface text-danger border-[3px] border-danger active:bg-danger-soft',
  success: 'bg-success text-white shadow-lg shadow-success/25 active:brightness-90',
};

// Every size is well above the 64px minimum touch target.
const SIZES: Record<ButtonSize, string> = {
  md: 'min-h-[96px] px-7 text-xl gap-3 rounded-2xl',
  lg: 'min-h-[112px] px-10 text-2xl gap-4 rounded-3xl',
  xl: 'min-h-[140px] px-12 text-3xl gap-5 rounded-[2rem]',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  loading?: boolean;
  block?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'lg',
  icon,
  loading,
  block,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-bold transition-transform duration-100 [&>svg]:shrink-0',
        'active:scale-[0.98] disabled:opacity-45 disabled:active:scale-100',
        'focus-visible:outline-[4px] focus-visible:outline-offset-4 focus-visible:outline-accent',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-[1.4em] animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx('rounded-[2rem] border-2 border-line bg-surface p-8 shadow-sm', className)}>
      {children}
    </div>
  );
}

export function Spinner({ label, className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      className={cx('flex flex-col items-center justify-center gap-6 text-muted', className)}
    >
      <LoaderCircle className="size-24 animate-spin text-brand" aria-hidden />
      {label && <p className="text-2xl font-semibold">{label}</p>}
    </div>
  );
}

export function ErrorBanner({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-center gap-6 rounded-3xl border-[3px] border-danger bg-danger-soft px-8 py-6 text-danger"
    >
      <TriangleAlert className="size-14 shrink-0" aria-hidden />
      <p className="flex-1 text-xl font-semibold">{message}</p>
      {action}
    </div>
  );
}

export function Badge({
  tone,
  children,
}: {
  tone: 'info' | 'success' | 'warning' | 'danger';
  children: ReactNode;
}) {
  const tones = {
    info: 'bg-brand-soft text-brand',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
  } as const;
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-6 py-2 text-lg font-bold',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Label/value row used in details cards. */
export function DetailRow({
  label,
  value,
  ltrValue,
}: {
  label: string;
  value: ReactNode;
  ltrValue?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-8 border-b-2 border-line/70 py-5 last:border-b-0">
      <dt className="text-xl text-muted">{label}</dt>
      <dd className="text-end text-xl font-bold" dir={ltrValue ? 'ltr' : undefined}>
        {value}
      </dd>
    </div>
  );
}
