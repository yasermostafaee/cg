import { useEffect, useState } from 'react';
import type { Scene } from '@cg/shared-schema';
import type { ExportIssue } from '@cg/shared-ipc';
import { colors } from '../../theme.js';

interface Props {
  scene: Scene | null;
  issues: readonly ExportIssue[];
}

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
} as const;

/** Bottom-of-window status bar — project chrome + issues badge + clock.
 *  Save / Export now live in the TopToolbar on the right. */
export function StatusBar({ scene, issues }: Props): JSX.Element {
  const [time, setTime] = useState<string>(currentTime());
  useEffect(() => {
    const t = setInterval(() => setTime(currentTime()), 30_000);
    return () => clearInterval(t);
  }, []);

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
      <span>{time}</span>
    </footer>
  );
}

function currentTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
