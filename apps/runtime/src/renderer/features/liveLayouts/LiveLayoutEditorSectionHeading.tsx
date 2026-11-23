import { ChevronRight, type LucideIcon } from 'lucide-react';
import { Icon } from '../../ui/Icon.js';

export function LiveLayoutEditorSectionHeading({
  icon,
  label,
}: {
  icon: LucideIcon;
  label: string;
}): JSX.Element {
  return (
    <summary className="cg-live-layout-section-heading">
      <Icon icon={icon} size={15} />
      {label}
      <Icon icon={ChevronRight} size={14} flipRtl />
    </summary>
  );
}
