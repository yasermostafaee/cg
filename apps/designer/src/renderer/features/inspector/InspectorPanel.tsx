import type { Scene } from '@cg/shared-schema';
import { colors } from '../../theme.js';

interface Props {
  scene: Scene | null;
  projectPath: string | null;
}

const styles = {
  panel: {
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    padding: '0.75rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
    minHeight: 0,
    overflowY: 'auto' as const,
  },
  heading: {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: colors.textMuted,
    letterSpacing: '0.05em',
    margin: 0,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '110px 1fr',
    gap: '0.5rem',
    fontSize: '0.85rem',
    padding: '0.2rem 0',
  },
  label: { color: colors.textMuted },
  value: { color: colors.text, fontWeight: 500 },
  empty: { color: colors.textMuted, fontSize: '0.9rem' },
} as const;

/**
 * Right-pane Inspector. M6.3 shows scene-level metadata only — the
 * Transform / Style sections that mutate selected elements land in M6.5
 * alongside the canvas selection model from M6.4.
 */
export function InspectorPanel({ scene, projectPath }: Props): JSX.Element {
  if (scene === null) {
    return (
      <aside style={styles.panel} aria-label="Inspector">
        <h2 style={styles.heading}>INSPECTOR</h2>
        <p style={styles.empty}>No project selected.</p>
      </aside>
    );
  }
  return (
    <aside style={styles.panel} aria-label="Inspector">
      <h2 style={styles.heading}>SCENE</h2>
      <div style={styles.row}>
        <span style={styles.label}>name</span>
        <span style={styles.value}>{scene.name}</span>
      </div>
      <div style={styles.row}>
        <span style={styles.label}>type</span>
        <span style={styles.value}>{scene.templateType}</span>
      </div>
      <div style={styles.row}>
        <span style={styles.label}>resolution</span>
        <span style={styles.value}>
          {scene.resolution.width}×{scene.resolution.height}
        </span>
      </div>
      <div style={styles.row}>
        <span style={styles.label}>frame rate</span>
        <span style={styles.value}>{scene.frameRate}</span>
      </div>
      <div style={styles.row}>
        <span style={styles.label}>layers</span>
        <span style={styles.value}>{scene.layers.length}</span>
      </div>
      <div style={styles.row}>
        <span style={styles.label}>path</span>
        <span style={styles.value}>{projectPath ?? '(unsaved)'}</span>
      </div>
    </aside>
  );
}
