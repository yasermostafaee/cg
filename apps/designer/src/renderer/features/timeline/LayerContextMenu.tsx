import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { designerStore } from '../../state/store.js';
import { cx } from '../../cx.js';
import { Icon } from '../../ui/Icon.js';
import * as s from './LayerContextMenu.css.js';

// JS-state hover highlight (these menus track hover in React state, not :hover).
const HOVER_BG: React.CSSProperties = { background: 'rgba(56,189,248,0.16)' };

// Shortcut hints shown after the menu labels (D-076/D-077). Platform-aware modifier.
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = IS_MAC ? '⌘' : 'Ctrl+';

interface Props {
  /**
   * The right-clicked element. The opener (ElementRow) uses it to normalize the
   * selection before the menu opens (D-076); the menu itself acts on the whole
   * selection via the selection-aware store ops, so it doesn't read this directly.
   */
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
// Approximate rendered heights, used only to clamp the menus inside the
// viewport. Overestimating slightly is safe — it just nudges the menu up a
// little earlier; it never clips content (the submenu also caps its own
// max-height to the viewport and scrolls as a last resort).
const MENU_HEIGHT = 208; // 7 items + a divider
const SUBMENU_FULL_HEIGHT = 420; // all color swatches
const EDGE = 8;

/**
 * Right-click menu for a timeline layer (element). Actions mirror the
 * reference (tc.png): Color ▶, Fit workspace, Copy / Cut / Paste,
 * Duplicate, Delete. "Move to nested composition" is intentionally
 * deferred until nested compositions exist.
 *
 * D-076 — every action (Color, Fit, Copy / Cut / Paste, Duplicate, Delete)
 * operates on the WHOLE current selection (the selection-aware store ops). The
 * right-clicked row is normalized into the selection at the row's `onContextMenu`
 * (ElementRow): a row already in the multi-selection keeps it, one outside it
 * retargets to just that row — so the menu always acts on the intended set.
 *
 * Rendered into a fixed full-viewport backdrop so a click (or Escape)
 * anywhere outside closes it; the menu clamps itself into the viewport.
 */
export function LayerContextMenu({ x, y, onClose }: Props): JSX.Element {
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

  // Clamp the menu — and especially the taller color submenu — fully inside
  // the viewport, flipping left / up when there isn't room on the natural side.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const menuLeft = Math.max(EDGE, Math.min(x, vw - MENU_WIDTH - EDGE));
  const menuTop = Math.max(EDGE, Math.min(y, vh - MENU_HEIGHT - EDGE));
  const submenuMaxH = Math.min(SUBMENU_FULL_HEIGHT, vh - 2 * EDGE);
  const submenuRight = menuLeft + MENU_WIDTH + 2;
  const submenuLeft =
    submenuRight + SUBMENU_WIDTH + EDGE <= vw
      ? submenuRight
      : Math.max(EDGE, menuLeft - SUBMENU_WIDTH - 2);
  const submenuTop = Math.max(EDGE, Math.min(menuTop, vh - submenuMaxH - EDGE));

  function run(action: () => void): void {
    action();
    onClose();
  }

  // The row's static look is a class; only the JS-state hover highlight is inline.
  const rowClass = (disabled = false): string => cx(s.item, disabled && s.itemDisabled);
  const hoverStyle = (key: string, disabled = false): React.CSSProperties | undefined =>
    hover === key && !disabled ? HOVER_BG : undefined;

  return (
    <div className={s.backdrop} onPointerDown={onClose} onContextMenu={(e) => e.preventDefault()}>
      <div
        className={s.menu}
        style={{ minWidth: MENU_WIDTH, left: menuLeft, top: menuTop }}
        onPointerDown={(e) => e.stopPropagation()}
        role="menu"
        aria-label="Layer actions"
      >
        <div
          className={rowClass()}
          style={hoverStyle('color')}
          role="menuitem"
          onMouseEnter={() => {
            setHover('color');
            setColorOpen(true);
          }}
          onMouseLeave={() => setHover(null)}
        >
          <span>Color</span>
          <span className={s.chevron}>
            <Icon icon={ChevronRight} size={14} flipRtl />
          </span>
        </div>
        <div
          className={rowClass()}
          style={hoverStyle('fit')}
          role="menuitem"
          onMouseEnter={() => {
            setHover('fit');
            setColorOpen(false);
          }}
          onMouseLeave={() => setHover(null)}
          onClick={() => run(() => designerStore.fitSelectionLifespanToActiveRange())}
        >
          <span>Fit workspace</span>
        </div>

        <div className={s.divider} aria-hidden />

        <div
          className={rowClass()}
          style={hoverStyle('copy')}
          role="menuitem"
          onMouseEnter={() => {
            setHover('copy');
            setColorOpen(false);
          }}
          onMouseLeave={() => setHover(null)}
          onClick={() => run(() => designerStore.copySelection())}
        >
          <span>Copy</span>
          <span className={s.shortcut}>({MOD}C)</span>
        </div>
        <div
          className={rowClass()}
          style={hoverStyle('cut')}
          role="menuitem"
          onMouseEnter={() => {
            setHover('cut');
            setColorOpen(false);
          }}
          onMouseLeave={() => setHover(null)}
          onClick={() => run(() => designerStore.cutSelection())}
        >
          <span>Cut</span>
          <span className={s.shortcut}>({MOD}X)</span>
        </div>
        <div
          className={rowClass(!canPaste)}
          style={hoverStyle('paste', !canPaste)}
          role="menuitem"
          aria-disabled={!canPaste}
          onMouseEnter={() => {
            setHover('paste');
            setColorOpen(false);
          }}
          onMouseLeave={() => setHover(null)}
          onClick={() => {
            if (canPaste) run(() => designerStore.pasteElements());
          }}
        >
          <span>Paste</span>
          <span className={s.shortcut}>({MOD}V)</span>
        </div>
        <div
          className={rowClass()}
          style={hoverStyle('duplicate')}
          role="menuitem"
          onMouseEnter={() => {
            setHover('duplicate');
            setColorOpen(false);
          }}
          onMouseLeave={() => setHover(null)}
          onClick={() => run(() => designerStore.duplicateSelection())}
        >
          <span>Duplicate</span>
        </div>
        <div
          className={rowClass()}
          style={hoverStyle('delete')}
          role="menuitem"
          onMouseEnter={() => {
            setHover('delete');
            setColorOpen(false);
          }}
          onMouseLeave={() => setHover(null)}
          onClick={() => run(() => designerStore.deleteSelection())}
        >
          <span>Delete</span>
          <span className={s.shortcut}>(Del)</span>
        </div>
      </div>

      {colorOpen && (
        <div
          className={s.submenu}
          style={{
            width: SUBMENU_WIDTH,
            left: submenuLeft,
            top: submenuTop,
            maxHeight: submenuMaxH,
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseEnter={() => setColorOpen(true)}
          role="menu"
          aria-label="Layer color"
        >
          {COLOR_SWATCHES.map((c) => (
            <div
              key={c.hex}
              className={s.swatchRow}
              style={hover === c.hex ? HOVER_BG : undefined}
              role="menuitemradio"
              aria-checked={false}
              onMouseEnter={() => setHover(c.hex)}
              onMouseLeave={() => setHover(null)}
              onClick={() => run(() => designerStore.setSelectionTimelineColor(c.hex))}
            >
              <span className={s.swatch} style={{ background: c.hex }} aria-hidden />
              <span>{c.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
