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

const TOOLS: readonly ToolEntry[] = [
  { id: 'cursor', label: 'Select', icon: '↖' },
  { id: 'shape', label: 'Rectangle', icon: '▭' },
  { id: 'text', label: 'Text', icon: 'T' },
  { id: 'ellipse', label: 'Ellipse', icon: '○' },
  { id: 'hand', label: 'Hand (pan)', icon: '✋' },
  { id: 'image', label: 'Image', icon: '▦' },
];

const styles = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.3rem 0.6rem',
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
  },
  group: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
  },
  divider: {
    width: 1,
    alignSelf: 'stretch' as const,
    background: colors.border,
    margin: '0 0.35rem',
  },
  button: {
    width: 30,
    height: 30,
    background: 'transparent',
    color: colors.textMuted,
    border: `1px solid transparent`,
    borderRadius: '0.22rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: '1.05rem',
    padding: 0,
  },
  buttonActive: {
    color: colors.text,
    background: colors.panelMuted,
    border: `1px solid ${colors.accentMuted}`,
  },
  back: {
    background: 'transparent',
    color: colors.textMuted,
    border: `1px solid ${colors.border}`,
    padding: '0.18rem 0.5rem',
    borderRadius: '0.22rem',
    fontSize: '0.72rem',
    cursor: 'pointer',
  },
  spacer: { flex: 1 },
} as const;

/**
 * Horizontal toolbar at the top of the Studio (D-007). Holds the six
 * tool buttons (cursor, rectangle, text, ellipse, hand, image) and a
 * "back to projects" affordance.
 */
export function TopToolbar({ tool }: Props): JSX.Element {
  return (
    <nav style={styles.bar} aria-label="Tools">
      <button
        type="button"
        style={styles.back}
        onClick={() => {
          designerStore.setScene(null, null);
        }}
        aria-label="Back to projects"
        title="Back to projects (closes the current scene)"
      >
        ← projects
      </button>
      <span style={styles.divider} />
      <div style={styles.group}>
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
      <span style={styles.spacer} />
    </nav>
  );
}
