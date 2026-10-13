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
  /**
   * `DESIGNER-FIX-0905` — the WHOLE section is withheld for this element kind: the
   * header stays, dimmed and inert, with the reason as its tooltip and a `withheld`
   * tag beside the title; the body is never rendered. A section that vanishes teaches
   * nothing about why it is unavailable (the Live Source's Filter section used to).
   */
  withheld?: string | undefined;
  children?: ReactNode;
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
  withheld,
  children,
}: Props): JSX.Element {
  const [open, setOpen] = useState(defaultExpanded);
  const expanded = pinned || open;
  if (withheld !== undefined) {
    return (
      <div className={s.section} data-testid="section-withheld" data-section={title}>
        <div className={s.headerWithheld} title={withheld} aria-disabled="true">
          <span className={s.chevron} aria-hidden />
          <span>{title}</span>
          <span className={s.withheldTag}>withheld</span>
        </div>
      </div>
    );
  }
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
