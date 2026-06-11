import { designerStore, type DesignerTool } from '../../state/store.js';
import { cx } from '../../cx.js';
import { Control } from '../../ui/Control.js';
import * as s from './ToolRail.css.js';

interface Props {
  tool: DesignerTool;
}

const tools: { id: DesignerTool; label: string; icon: string }[] = [
  { id: 'cursor', label: 'Select', icon: '↖' },
  { id: 'text', label: 'Text', icon: 'T' },
  { id: 'ticker', label: 'Ticker', icon: '⇇' },
  { id: 'clock', label: 'Clock', icon: '◷' },
  { id: 'shape', label: 'Rectangle', icon: '▭' },
  { id: 'ellipse', label: 'Ellipse', icon: '○' },
  { id: 'image', label: 'Image', icon: '▦' },
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
            {t.icon}
          </Control>
        );
      })}
    </nav>
  );
}
