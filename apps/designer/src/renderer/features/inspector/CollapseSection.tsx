import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import * as s from './CollapseSection.css.js';

interface Props {
  title: string;
  defaultExpanded?: boolean;
  /** Optional trailing element shown right of the chevron (e.g. a star). */
  trailing?: ReactNode;
  /**
   * Always open and not collapsible — renders a plain header with no chevron /
   * toggle. For sections that should never be hidden (Transform, Path Style).
   */
  pinned?: boolean;
  children: ReactNode;
}

/**
 * Collapsible section with a chevron toggle. Mirrors the Loopic right
 * panel: `▾ TRANSFORM`, `▸ DROP SHADOW`, etc. Sections own their own
 * expand/collapse state.
 */
export function CollapseSection({
  title,
  defaultExpanded = false,
  trailing,
  pinned = false,
  children,
}: Props): JSX.Element {
  const [open, setOpen] = useState(defaultExpanded);
  const expanded = pinned || open;
  return (
    <div className={s.section}>
      {pinned ? (
        <div className={s.header} style={{ cursor: 'default' }}>
          <span>{title}</span>
          {trailing !== undefined && <span className={s.trailing}>{trailing}</span>}
        </div>
      ) : (
        <Button
          variant="bare"
          className={s.header}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`Toggle ${title}`}
        >
          <span className={s.chevron}>
            {open ? (
              <Icon icon={ChevronDown} size={14} />
            ) : (
              <Icon icon={ChevronRight} size={14} flipRtl />
            )}
          </span>
          <span>{title}</span>
          {trailing !== undefined && <span className={s.trailing}>{trailing}</span>}
        </Button>
      )}
      {expanded && <div className={s.body}>{children}</div>}
    </div>
  );
}
