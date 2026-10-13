import { forwardRef, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Icon } from './Icon.js';

/**
 * 🔴 `PLAYOUT-SOURCES-01` §2.A — **A FIELD THAT OPENS A PICKER, dressed exactly as a select.**
 *
 * Closed, the source picker must look like the select it replaces — same primitive, same height —
 * so a form that mixes the two reads as one form. It is `.cg-field` first in its class list, the
 * one input skin (ground, edge, radius, hover, the one focus ring), plus `.cg-combo-field` for what a
 * button needs that an input does not: its content on one line and a chevron where a select's is.
 *
 * It is a `role="combobox"` BUTTON: pressing it (or Enter, Space, ↓) opens the panel it
 * `aria-controls`. It shows the current choice as its caller renders it — a source's icon and name,
 * or `None` — and never a value the operator did not choose.
 *
 * No `style` prop, for `TextInput`'s reason: appearance belongs to the stylesheet. A caller's
 * surface names itself through `className`, appended after the skin (`is-dirty`, a struck value).
 */
export interface ComboFieldProps {
  /** What the field shows: the current choice, in the caller's words. */
  children: ReactNode;
  expanded: boolean;
  /**
   * The panel's `id`. Named while closed too — a combobox always says what it controls, and with
   * `aria-expanded="false"` the panel is expected not to exist yet.
   */
  controls: string;
  onOpen: () => void;
  'aria-label': string;
  id?: string | undefined;
  disabled?: boolean | undefined;
  /** APPENDED after `cg-field cg-combo-field`, never replacing them. */
  className?: string | undefined;
  title?: string | undefined;
  /** A finder's attributes (`data-*`). */
  data?: Readonly<Record<`data-${string}`, string>> | undefined;
}

export const ComboField = forwardRef<HTMLButtonElement, ComboFieldProps>(function ComboField(
  {
    children,
    expanded,
    controls,
    onOpen,
    'aria-label': ariaLabel,
    id,
    disabled,
    className,
    title,
    data,
  },
  ref,
): JSX.Element {
  return (
    <button
      ref={ref}
      type="button"
      role="combobox"
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label={ariaLabel}
      id={id}
      disabled={disabled}
      title={title}
      className={['cg-field', 'cg-combo-field', className].filter(Boolean).join(' ')}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          onOpen();
        }
      }}
      {...(data ?? {})}
    >
      <span className="cg-combo-field__value">{children}</span>
      <Icon icon={ChevronDown} size={14} />
    </button>
  );
});
