import { colors } from '../../theme.js';
import { designerStore, type DesignerTool } from '../../state/store.js';

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
const TOOLS: readonly ToolEntry[] = [
  { id: 'cursor', label: 'Select', icon: '↖' },
  { id: 'hand', label: 'Hand (pan)', icon: '✋' },
  { id: 'text', label: 'Text', icon: 'T' },
  { id: 'shape', label: 'Rectangle', icon: '▭' },
  { id: 'ellipse', label: 'Ellipse', icon: '○' },
  { id: 'image', label: 'Image', icon: '▦' },
];

const styles = {
  group: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.2rem',
  },
  button: {
    width: 26,
    height: 26,
    background: 'transparent',
    color: colors.textMuted,
    border: '1px solid transparent',
    borderRadius: '0.22rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: '0.95rem',
    padding: 0,
  },
  buttonActive: {
    color: colors.text,
    background: colors.panelMuted,
    border: `1px solid ${colors.accentMuted}`,
  },
} as const;

/**
 * D-008 — shape tools, rendered on the LEFT side of the canvas header.
 * Six tools matching the reference pic in this order:
 *   cursor | hand | text | rectangle | ellipse | image
 */
export function CanvasToolbar({ tool }: Props): JSX.Element {
  return (
    <div style={styles.group} role="toolbar" aria-label="Canvas tools">
      {TOOLS.map((t) => {
        const active = t.id === tool;
        return (
          <button
            key={t.id}
            type="button"
            style={active ? { ...styles.button, ...styles.buttonActive } : styles.button}
            onClick={() => designerStore.setTool(t.id)}
            title={t.label}
            aria-label={t.label}
            aria-pressed={active}
          >
            {t.icon}
          </button>
        );
      })}
    </div>
  );
}
