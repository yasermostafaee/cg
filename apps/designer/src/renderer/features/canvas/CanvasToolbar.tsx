import { useState } from 'react';
import {
  ArrowDownUp,
  Circle,
  Clock,
  Hand,
  Image,
  MousePointer2,
  MoveHorizontal,
  Rows3,
  Square,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { designerStore, type DesignerTool } from '../../state/store.js';
import { cx } from '../../cx.js';
import { Control } from '../../ui/Control.js';
import { Icon } from '../../ui/Icon.js';
import * as s from './CanvasToolbar.css.js';

interface Props {
  tool: DesignerTool;
}

interface ToolEntry {
  id: DesignerTool;
  label: string;
  icon: LucideIcon;
}

// D-092 order — drawing tools first (cursor, hand, text, rectangle, ellipse,
// image), then the dynamic / data-driven elements (ticker, sequence, clock,
// repeater). (The D-008 reference pic also includes a thin diagonal "line" tool;
// the underlying schema has no line element yet, so it stays out.)
const TOOLS: readonly ToolEntry[] = [
  { id: 'cursor', label: 'Select', icon: MousePointer2 },
  { id: 'hand', label: 'Hand (pan)', icon: Hand },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'shape', label: 'Rectangle', icon: Square },
  { id: 'ellipse', label: 'Ellipse', icon: Circle },
  // D-040 — the logo/image tool stamps the selected Shared Library image (the
  // shared source it needed now exists); empty library ⇒ a hint, no silent insert.
  { id: 'image', label: 'Image (logo)', icon: Image },
  { id: 'ticker', label: 'Ticker', icon: MoveHorizontal },
  { id: 'sequence', label: 'Sequence', icon: ArrowDownUp },
  { id: 'clock', label: 'Clock', icon: Clock },
  { id: 'repeater', label: 'Repeater', icon: Rows3 },
];

/**
 * D-008 — canvas tools, rendered on the LEFT side of the canvas header.
 * D-092 order — drawing tools first (cursor | hand | text | rectangle | ellipse |
 * image) then the dynamic / data-driven elements (ticker | sequence | clock |
 * repeater).
 */
export function CanvasToolbar({ tool }: Props): JSX.Element {
  const [hovered, setHovered] = useState<DesignerTool | null>(null);
  return (
    <div className={s.group} role="toolbar" aria-label="Canvas tools">
      {TOOLS.map((t) => {
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
    </div>
  );
}
