import type { StackItemStatus } from '@cg/shared-schema';
import { airStateVisual, badgeTone } from '../theme.js';

/**
 * R-007 — the stack item status pill. Colors come from the `--r-*` badge-tone
 * classes (a coherent role language), while the icon + label stay verbatim from
 * `airStateVisual` (so the Playwright badge-word hooks — 'ON AIR', 'UPDATING',
 * 'UNCONFIRMED', … — remain stable). Never hue alone: icon + word always.
 */
export function StatusBadge({
  status,
  pending,
}: {
  status: StackItemStatus;
  pending: boolean;
}): JSX.Element {
  const visual = airStateVisual(status, pending);
  const tone = badgeTone(status, pending);
  return (
    <span className={`cg-badge cg-badge--${tone}`} aria-label={`status ${visual.label}`}>
      <span className="cg-badge__icon" aria-hidden="true">
        {visual.icon}
      </span>
      {visual.label}
    </span>
  );
}
