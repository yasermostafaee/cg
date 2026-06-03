import { useEffect, useState } from 'react';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';

interface Props {
  elementId: string;
  /** Viewport coordinates of the right-click. */
  x: number;
  y: number;
  onClose: () => void;
}

/**
 * Named swatches for the layer-color submenu, in the order shown in the
 * reference (tc.png). Each maps to a `#RRGGBB` that satisfies HexColorSchema.
 */
const COLOR_SWATCHES: readonly { label: string; hex: string }[] = [
  { label: 'Light green', hex: '#A3E635' },
  { label: 'Green', hex: '#22C55E' },
  { label: 'Dark green', hex: '#15803D' },
  { label: 'Magenta', hex: '#EC4899' },
  { label: 'Light purple', hex: '#C4B5FD' },
  { label: 'Purple', hex: '#A855F7' },
  { label: 'Dark purple', hex: '#7C3AED' },
  { label: 'Darken', hex: '#1E293B' },
  { label: 'Teal', hex: '#14B8A6' },
  { label: 'Light blue', hex: '#7DD3FC' },
  { label: 'Blue', hex: '#3B82F6' },
  { label: 'Dark blue', hex: '#1D4ED8' },
  { label: 'Yellow', hex: '#FACC15' },
  { label: 'Orange', hex: '#F97316' },
  { label: 'Dark orange', hex: '#C2410C' },
  { label: 'Red', hex: '#EF4444' },
  { label: 'Dark red', hex: '#991B1B' },
  { label: 'White', hex: '#F8FAFC' },
];

const MENU_WIDTH = 184;
const SUBMENU_WIDTH = 188;

const styles = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 1000,
  },
  menu: {
    position: 'fixed' as const,
    minWidth: MENU_WIDTH,
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.3rem',
    padding: '0.25rem',
    boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
    fontSize: '0.74rem',
    color: colors.text,
    userSelect: 'none' as const,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    padding: '0.3rem 0.5rem',
    borderRadius: '0.2rem',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  itemDisabled: {
    opacity: 0.4,
    cursor: 'default' as const,
  },
  divider: {
    height: 1,
    background: colors.border,
    margin: '0.25rem 0.2rem',
  },
  chevron: {
    color: colors.textMuted,
    fontSize: '0.7rem',
  },
  submenu: {
    position: 'fixed' as const,
    width: SUBMENU_WIDTH,
    maxHeight: 320,
    overflowY: 'auto' as const,
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.3rem',
    padding: '0.25rem',
    boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
  },
  swatchRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.22rem 0.45rem',
    borderRadius: '0.2rem',
    cursor: 'pointer',
  },
  swatch: {
    width: 13,
    height: 13,
    borderRadius: 3,
    flexShrink: 0,
    border: '1px solid rgba(255,255,255,0.18)',
  },
} as const;

/**
 * Right-click menu for a timeline layer (element). Actions mirror the
 * reference (tc.png): Color ▶, Fit workspace, Copy / Cut / Paste,
 * Duplicate, Delete. "Move to nested composition" is intentionally
 * deferred until nested compositions exist.
 *
 * Rendered into a fixed full-viewport backdrop so a click (or Escape)
 * anywhere outside closes it; the menu clamps itself into the viewport.
 */
export function LayerContextMenu({ elementId, x, y, onClose }: Props): JSX.Element {
  const [hover, setHover] = useState<string | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const canPaste = designerStore.hasClipboardElement();

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Clamp the menu inside the viewport.
  const menuLeft = Math.min(x, window.innerWidth - MENU_WIDTH - 8);
  const menuTop = Math.min(y, window.innerHeight - 280);

  function run(action: () => void): void {
    action();
    onClose();
  }

  function rowStyle(key: string, disabled = false): React.CSSProperties {
    return {
      ...styles.item,
      ...(disabled ? styles.itemDisabled : {}),
      ...(hover === key && !disabled ? { background: 'rgba(56,189,248,0.16)' } : {}),
    };
  }

  return (
    <div style={styles.backdrop} onPointerDown={onClose} onContextMenu={(e) => e.preventDefault()}>
      <div
        style={{ ...styles.menu, left: menuLeft, top: menuTop }}
        onPointerDown={(e) => e.stopPropagation()}
        role="menu"
        aria-label="Layer actions"
      >
        <div
          style={rowStyle('color')}
          role="menuitem"
          onMouseEnter={() => {
            setHover('color');
            setColorOpen(true);
          }}
          onMouseLeave={() => setHover(null)}
        >
          <span>Color</span>
          <span style={styles.chevron}>▶</span>
        </div>
        <div
          style={rowStyle('fit')}
          role="menuitem"
          onMouseEnter={() => {
            setHover('fit');
            setColorOpen(false);
          }}
          onMouseLeave={() => setHover(null)}
          onClick={() => run(() => designerStore.fitElementLifespanToActiveRange(elementId))}
        >
          <span>Fit workspace</span>
        </div>

        <div style={styles.divider} aria-hidden />

        <div
          style={rowStyle('copy')}
          role="menuitem"
          onMouseEnter={() => {
            setHover('copy');
            setColorOpen(false);
          }}
          onMouseLeave={() => setHover(null)}
          onClick={() => run(() => designerStore.copyElement(elementId))}
        >
          <span>Copy</span>
        </div>
        <div
          style={rowStyle('cut')}
          role="menuitem"
          onMouseEnter={() => {
            setHover('cut');
            setColorOpen(false);
          }}
          onMouseLeave={() => setHover(null)}
          onClick={() => run(() => designerStore.cutElement(elementId))}
        >
          <span>Cut</span>
        </div>
        <div
          style={rowStyle('paste', !canPaste)}
          role="menuitem"
          aria-disabled={!canPaste}
          onMouseEnter={() => {
            setHover('paste');
            setColorOpen(false);
          }}
          onMouseLeave={() => setHover(null)}
          onClick={() => {
            if (canPaste) run(() => designerStore.pasteElement());
          }}
        >
          <span>Paste</span>
        </div>
        <div
          style={rowStyle('duplicate')}
          role="menuitem"
          onMouseEnter={() => {
            setHover('duplicate');
            setColorOpen(false);
          }}
          onMouseLeave={() => setHover(null)}
          onClick={() => run(() => designerStore.duplicateElement(elementId))}
        >
          <span>Duplicate</span>
        </div>
        <div
          style={rowStyle('delete')}
          role="menuitem"
          onMouseEnter={() => {
            setHover('delete');
            setColorOpen(false);
          }}
          onMouseLeave={() => setHover(null)}
          onClick={() => run(() => designerStore.removeElement(elementId))}
        >
          <span>Delete</span>
        </div>
      </div>

      {colorOpen && (
        <div
          style={{
            ...styles.submenu,
            left: Math.min(menuLeft + MENU_WIDTH + 2, window.innerWidth - SUBMENU_WIDTH - 8),
            top: menuTop,
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseEnter={() => setColorOpen(true)}
          role="menu"
          aria-label="Layer color"
        >
          {COLOR_SWATCHES.map((c) => (
            <div
              key={c.hex}
              style={{
                ...styles.swatchRow,
                ...(hover === c.hex ? { background: 'rgba(56,189,248,0.16)' } : {}),
              }}
              role="menuitemradio"
              aria-checked={false}
              onMouseEnter={() => setHover(c.hex)}
              onMouseLeave={() => setHover(null)}
              onClick={() => run(() => designerStore.setElementTimelineColor(elementId, c.hex))}
            >
              <span style={{ ...styles.swatch, background: c.hex }} aria-hidden />
              <span>{c.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
