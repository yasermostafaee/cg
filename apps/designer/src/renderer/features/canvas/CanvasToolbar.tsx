import { useState } from 'react';
import { designerStore, type DesignerTool } from '../../state/store.js';
import { cx } from '../../cx.js';
import { Control } from '../../ui/Control.js';
import * as s from './CanvasToolbar.css.js';

interface Props {
  tool: DesignerTool;
}

interface ToolEntry {
  id: DesignerTool;
  label: string;
  icon: string;
}

// Order per the D-008 reference pic: cursor, hand, text, rectangle,
// ellipse, image. (The pic also includes a thin diagonal "line" tool;
// the underlying schema has no line element yet, so it stays out.)
// The hand uses U+270B (RAISED HAND) followed by U+FE0E (VARIATION
// SELECTOR-15). VS15 asks the renderer for the text presentation, so
// the glyph is monochrome and follows the CSS `color` rule instead of
// the OS's colour-emoji font — matches the rest of the tool icons.
const HAND_ICON = '✋︎';

const TOOLS: readonly ToolEntry[] = [
  { id: 'cursor', label: 'Select', icon: '↖' },
  { id: 'hand', label: 'Hand (pan)', icon: HAND_ICON },
  { id: 'text', label: 'Text', icon: 'T' },
  { id: 'ticker', label: 'Ticker', icon: '⇇' },
  { id: 'shape', label: 'Rectangle', icon: '▭' },
  { id: 'ellipse', label: 'Ellipse', icon: '○' },
  // Image tool hidden for now — placement/upload flow needs rework before it
  // ships. Re-add `{ id: 'image', label: 'Image', icon: '▦' }` when fixed.
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
            {t.icon}
          </Control>
        );
      })}
    </div>
  );
}
