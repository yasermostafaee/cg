import type { Scene } from '@cg/shared-schema';
import type { ExportIssue } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { designerStore, useDesignerStore } from '../../state/store.js';

interface Props {
  scene: Scene | null;
  issues: readonly ExportIssue[];
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 20;

const styles = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.25rem',
    padding: '0.4rem 0.75rem',
    background: colors.panel,
    borderTop: `1px solid ${colors.border}`,
    fontSize: '0.8rem',
    color: colors.textMuted,
  },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.1rem 0.5rem',
    borderRadius: '0.25rem',
    border: `1px solid ${colors.border}`,
    background: colors.panelMuted,
  },
  spacer: { flex: 1 },
  zoomWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.45rem',
    fontSize: '0.7rem',
    color: colors.textMuted,
  },
  zoomSlider: {
    width: 140,
    accentColor: colors.accent,
    cursor: 'pointer',
  },
  zoomReadout: {
    minWidth: 36,
    textAlign: 'right' as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  zoomButton: {
    background: colors.panelMuted,
    color: colors.textMuted,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.2rem',
    padding: '0 0.4rem',
    fontSize: '0.72rem',
    cursor: 'pointer',
    lineHeight: 1.6,
  },
} as const;

/** Bottom-of-window status bar — project chrome + issues badge + a
 *  slider that horizontally zooms the timeline. Save / Export live in
 *  the TopToolbar on the right. */
export function StatusBar({ scene, issues }: Props): JSX.Element {
  const { timelineZoom } = useDesignerStore();
  const errorCount = issues.filter((i) => i.severity === 'error').length;

  return (
    <footer style={styles.bar} aria-label="Status bar">
      <span style={styles.pill}>{scene === null ? 'no project' : scene.templateType}</span>
      <span style={styles.pill}>
        {scene === null ? '0×0' : `${scene.resolution.width}×${scene.resolution.height}`}
      </span>
      {issues.length > 0 && (
        <span
          style={{
            ...styles.pill,
            borderColor: errorCount > 0 ? '#fda4af' : '#fcd34d',
            color: errorCount > 0 ? '#fda4af' : '#fcd34d',
          }}
        >
          {errorCount > 0
            ? `${String(errorCount)} error${errorCount === 1 ? '' : 's'}`
            : `${String(issues.length)} issue${issues.length === 1 ? '' : 's'}`}
        </span>
      )}
      <span style={styles.spacer} />
      <div style={styles.zoomWrap} aria-label="Timeline zoom">
        <button
          type="button"
          style={styles.zoomButton}
          onClick={() => designerStore.setTimelineZoom(timelineZoom - 1)}
          disabled={timelineZoom <= ZOOM_MIN}
          aria-label="Zoom out timeline"
          title="Zoom out timeline"
        >
          −
        </button>
        <input
          type="range"
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={1}
          value={timelineZoom}
          onChange={(e) => designerStore.setTimelineZoom(Number(e.target.value))}
          style={styles.zoomSlider}
          aria-label="Timeline zoom"
          title={`Timeline zoom ${String(timelineZoom)}×`}
        />
        <button
          type="button"
          style={styles.zoomButton}
          onClick={() => designerStore.setTimelineZoom(timelineZoom + 1)}
          disabled={timelineZoom >= ZOOM_MAX}
          aria-label="Zoom in timeline"
          title="Zoom in timeline"
        >
          +
        </button>
        <span style={styles.zoomReadout}>{timelineZoom}×</span>
      </div>
    </footer>
  );
}
