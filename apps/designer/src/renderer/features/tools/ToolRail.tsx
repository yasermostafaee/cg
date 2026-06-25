import {
  ArrowDownUp,
  Circle,
  Clock,
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
import * as s from './ToolRail.css.js';

interface Props {
  tool: DesignerTool;
}

// D-092 order — drawing tools first, then the dynamic / data-driven elements
// (matches CanvasToolbar; this rail has no hand/pan tool).
const tools: { id: DesignerTool; label: string; icon: LucideIcon }[] = [
  { id: 'cursor', label: 'Select', icon: MousePointer2 },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'shape', label: 'Rectangle', icon: Square },
  { id: 'ellipse', label: 'Ellipse', icon: Circle },
  { id: 'image', label: 'Image', icon: Image },
  { id: 'ticker', label: 'Ticker', icon: MoveHorizontal },
  { id: 'sequence', label: 'Sequence', icon: ArrowDownUp },
  { id: 'clock', label: 'Clock', icon: Clock },
  { id: 'repeater', label: 'Repeater', icon: Rows3 },
];

/**
 * Left rail with the four M6 tool buttons. Active tool gets a subtle
 * background; element-drawing wiring (canvas → store) lands in M6.4.
 */
export function ToolRail({ tool }: Props): JSX.Element {
  return (
    <nav className={s.rail} aria-label="Tools">
      {tools.map((t) => {
        const active = t.id === tool;
        return (
          <Control
            key={t.id}
            variant="bare"
            className={cx(s.button, active && s.buttonActive)}
            onClick={() => designerStore.setTool(t.id)}
            title={t.label}
            aria-label={t.label}
            aria-pressed={active}
          >
            <Icon icon={t.icon} size={18} />
          </Control>
        );
      })}
    </nav>
  );
}
