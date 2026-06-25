import { useState } from 'react';
import {
  ChevronsLeft,
  ChevronsRight,
  Circle,
  Clock,
  Hand,
  Image,
  MousePointer2,
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

// Order per the D-008 reference pic: cursor, hand, text, rectangle,
// ellipse, image. (The pic also includes a thin diagonal "line" tool;
// the underlying schema has no line element yet, so it stays out.)
const TOOLS: readonly ToolEntry[] = [
  { id: 'cursor', label: 'Select', icon: MousePointer2 },
  { id: 'hand', label: 'Hand (pan)', icon: Hand },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'ticker', label: 'Ticker', icon: ChevronsLeft },
  { id: 'clock', label: 'Clock', icon: Clock },
  { id: 'sequence', label: 'Sequence', icon: ChevronsRight },
  { id: 'repeater', label: 'Repeater', icon: Rows3 },
  { id: 'shape', label: 'Rectangle', icon: Square },
  { id: 'ellipse', label: 'Ellipse', icon: Circle },
  // D-040 — the logo/image tool stamps the selected Shared Library image (the
  // shared source it needed now exists); empty library ⇒ a hint, no silent insert.
  { id: 'image', label: 'Image (logo)', icon: Image },
];

/**
 * D-008 — shape tools, rendered on the LEFT side of the canvas header.
 * Six tools matching the reference pic in this order:
 *   cursor | hand | text | rectangle | ellipse | image
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
