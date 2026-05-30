import { colors } from '../../theme.js';
import { designerStore, type DesignerTool } from '../../state/store.js';

interface Props {
  tool: DesignerTool;
}

const tools: { id: DesignerTool; label: string; icon: string }[] = [
  { id: 'cursor', label: 'Select', icon: '↖' },
  { id: 'text', label: 'Text', icon: 'T' },
  { id: 'shape', label: 'Rectangle', icon: '▭' },
  { id: 'ellipse', label: 'Ellipse', icon: '○' },
  { id: 'image', label: 'Image', icon: '▦' },
];

const styles = {
  rail: {
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    padding: '0.5rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.4rem',
    width: 56,
  },
  button: {
    width: 40,
    height: 40,
    background: 'transparent',
    color: colors.textMuted,
    border: `1px solid transparent`,
    borderRadius: '0.25rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: '1.2rem',
  },
  buttonActive: {
    color: colors.text,
    background: colors.panelMuted,
    border: `1px solid ${colors.border}`,
  },
} as const;

/**
 * Left rail with the four M6 tool buttons. Active tool gets a subtle
 * background; element-drawing wiring (canvas → store) lands in M6.4.
 */
export function ToolRail({ tool }: Props): JSX.Element {
  return (
    <nav style={styles.rail} aria-label="Tools">
      {tools.map((t) => {
        const active = t.id === tool;
        return (
          <button
            key={t.id}
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
    </nav>
  );
}
