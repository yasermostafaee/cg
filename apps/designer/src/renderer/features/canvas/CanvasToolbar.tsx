import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownUp,
  Circle,
  Clock,
  Hand,
  LayoutGrid,
  MoreHorizontal,
  MousePointer2,
  MoveHorizontal,
  PenTool,
  Rows3,
  Square,
  Type,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { designerStore, useDesignerSelector, type DesignerTool } from '../../state/store.js';
import { projectLookGroup } from '../../state/slices/looks.js';
import { cx } from '../../cx.js';
import { Control } from '../../ui/Control.js';
import { Icon } from '../../ui/Icon.js';
import * as s from './CanvasToolbar.css.js';

interface Props {
  tool: DesignerTool;
  /** The canvas header, not the app window, is too narrow for every direct tool. */
  compact?: boolean;
}

interface ToolEntry {
  id: DesignerTool;
  label: string;
  icon: LucideIcon;
}

// D-092 order — drawing tools first (cursor, hand, text, rectangle, ellipse,
// pen), then the dynamic / data-driven elements (ticker, sequence, clock,
// repeater). (The D-008 reference pic also includes a thin diagonal "line" tool;
// the underlying schema has no line element yet, so it stays out.)
const TOOLS: readonly ToolEntry[] = [
  { id: 'cursor', label: 'Select', icon: MousePointer2 },
  { id: 'hand', label: 'Hand (pan)', icon: Hand },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'shape', label: 'Rectangle', icon: Square },
  { id: 'ellipse', label: 'Ellipse', icon: Circle },
  // D-109 — the Pen tool draws an editable bézier `path` element.
  { id: 'pen', label: 'Pen', icon: PenTool },
  // D-137 — the Live Source tool. Drawn, not imported: it carries no asset (its
  // authoring bars are procedural), so unlike Lottie it earns a toolbar button.
  { id: 'live-source', label: 'Plate', icon: Video },
  // D-125 — there is deliberately NO Lottie drawing tool: a Lottie is asset-backed,
  // so it enters via Project Assets (import → allowlist-validated) and drag-drop onto
  // the canvas, not a toolbar button (which would be a redundant no-op needing an
  // imported asset first).
  { id: 'ticker', label: 'Ticker', icon: MoveHorizontal },
  { id: 'sequence', label: 'Sequence', icon: ArrowDownUp },
  { id: 'clock', label: 'Clock', icon: Clock },
  { id: 'repeater', label: 'Repeater', icon: Rows3 },
];

const COMPACT_DIRECT_TOOLS = new Set<DesignerTool>(['cursor', 'hand']);

/**
 * D-008 — canvas tools, rendered on the LEFT side of the canvas header.
 * D-092 order — drawing tools first (cursor | hand | text | rectangle | ellipse |
 * image) then the dynamic / data-driven elements (ticker | sequence | clock |
 * repeater).
 */
export function CanvasToolbar({ tool, compact = false }: Props): JSX.Element {
  const [hovered, setHovered] = useState<DesignerTool | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);
  // A primitive, so the useSyncExternalStore selector never returns a fresh object
  // (the C2 infinite-re-render lesson).
  const hasGroup = useDesignerSelector((st) => projectLookGroup(st.scene) !== undefined);
  const directTools = compact ? TOOLS.filter((t) => COMPACT_DIRECT_TOOLS.has(t.id)) : TOOLS;
  const menuTools = compact ? TOOLS.filter((t) => !COMPACT_DIRECT_TOOLS.has(t.id)) : [];
  const activeMenuTool = menuTools.find((entry) => entry.id === tool);

  useEffect(() => {
    if (!moreOpen) return;
    const closeOutside = (event: PointerEvent): void => {
      if (!groupRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('pointerdown', closeOutside);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!compact) setMoreOpen(false);
  }, [compact]);

  return (
    <div
      ref={groupRef}
      className={s.group}
      role="toolbar"
      aria-label="Canvas tools"
      data-compact={compact ? 'true' : 'false'}
    >
      {directTools.map((t) => {
        const active = t.id === tool;
        return (
          <Control
            key={t.id}
            variant="bare"
            className={cx(
              s.button,
              hovered === t.id && !active && s.buttonHover,
              active && s.buttonActive,
            )}
            onClick={() => designerStore.setTool(t.id)}
            onMouseEnter={() => setHovered(t.id)}
            onMouseLeave={() => setHovered((h) => (h === t.id ? null : h))}
            title={t.label}
            aria-label={t.label}
            aria-pressed={active}
          >
            <Icon icon={t.icon} size={18} />
          </Control>
        );
      })}
      {compact && (
        <div className={s.moreWrap}>
          <Control
            variant="bare"
            className={cx(s.button, activeMenuTool !== undefined && s.buttonActive)}
            onClick={() => setMoreOpen((open) => !open)}
            title={
              activeMenuTool === undefined
                ? 'More canvas tools'
                : `More canvas tools — ${activeMenuTool.label} selected`
            }
            aria-label="More canvas tools"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-pressed={activeMenuTool !== undefined}
          >
            <Icon icon={MoreHorizontal} size={18} />
          </Control>
          {moreOpen && (
            <div className={s.moreMenu} role="menu" aria-label="More canvas tools">
              {menuTools.map((entry) => {
                const EntryIcon = entry.icon;
                const active = entry.id === tool;
                return (
                  <Control
                    key={entry.id}
                    variant="bare"
                    className={cx(s.moreItem, active && s.moreItemActive)}
                    role="menuitemradio"
                    aria-label={entry.label}
                    aria-checked={active}
                    onClick={() => {
                      designerStore.setTool(entry.id);
                      setMoreOpen(false);
                    }}
                  >
                    <Icon icon={EntryIcon} size={16} />
                    <span>{entry.label}</span>
                  </Control>
                );
              })}
              <div className={s.moreDivider} aria-hidden />
              <Control
                variant="bare"
                className={s.moreItem}
                role="menuitem"
                aria-label="Add multi-frame group"
                onClick={() => {
                  designerStore.createLookGroup();
                  setMoreOpen(false);
                }}
                disabled={hasGroup}
                title={hasGroup ? 'Multi-frame group already added' : 'Add multi-frame group'}
              >
                <Icon icon={LayoutGrid} size={16} />
                <span>Add multi-frame group</span>
              </Control>
            </div>
          )}
        </div>
      )}
      {/* LOOKS phase 2 (§14) — a DIRECT ACTION, not a placement tool: a multi-frame
          group is a property of the composition, so there is nothing to click onto the
          canvas. Disabled once the template has its group — v1 is ONE per template. */}
      {!compact && (
        <Control
          variant="bare"
          className={s.button}
          onClick={() => designerStore.createLookGroup()}
          disabled={hasGroup}
          title={hasGroup ? 'Multi-frame group already added' : 'Add multi-frame group'}
          aria-label="Add multi-frame group"
        >
          <Icon icon={LayoutGrid} size={18} />
        </Control>
      )}
    </div>
  );
}
