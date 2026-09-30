import {
  Award,
  Car,
  FileText,
  LayoutGrid,
  Receipt,
  Scale,
  Search,
  type LucideIcon,
} from 'lucide-react';
import type { Service } from '@kiosk/shared';

const ICONS: Record<Service['icon'] | 'grid', LucideIcon> = {
  car: Car,
  search: Search,
  receipt: Receipt,
  certificate: Award,
  scale: Scale,
  document: FileText,
  grid: LayoutGrid,
};

export function ServiceIcon({
  icon,
  className,
}: {
  icon: Service['icon'] | 'grid';
  className?: string;
}) {
  const Icon = ICONS[icon];
  return <Icon className={className} aria-hidden strokeWidth={1.8} />;
}
