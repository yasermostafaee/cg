import { useEffect, useState } from 'react';
import type { Scene } from '@cg/shared-schema';
import type { ExportIssue } from '@cg/shared-ipc';
import { colors } from '../../theme.js';

interface Props {
  scene: Scene | null;
  projectPath: string | null;
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
  saveButton: {
    background: colors.accent,
    color: '#000',
    border: 'none',
    padding: '0.2rem 0.6rem',
    borderRadius: '0.25rem',
    fontSize: '0.8rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
  exportButton: {
    background: 'transparent',
    color: colors.text,
    border: `1px solid ${colors.border}`,
    padding: '0.2rem 0.6rem',
    borderRadius: '0.25rem',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
} as const;

/** Bottom-of-window status bar — project chrome + Save / Export shortcuts. */
export function StatusBar({ scene, projectPath, issues }: Props): JSX.Element {
  const [time, setTime] = useState<string>(currentTime());
  useEffect(() => {
    const t = setInterval(() => setTime(currentTime()), 30_000);
    return () => clearInterval(t);
  }, []);

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const exportBlocked = scene === null || errorCount > 0;

  async function save(): Promise<void> {
    if (scene === null) return;
    const path = projectPath ?? window.prompt('Save scene as (full path, .scene.json):');
    if (path === null || path === '') return;
    await window.cg.projects.save({ scene, path });
  }

  async function exportVcg(): Promise<void> {
    if (scene === null) return;
    if (errorCount > 0) {
      window.alert(`Export blocked: ${String(errorCount)} validation error(s) in Issues panel.`);
      return;
    }
    const outputPath = window.prompt('Output .vcg path:');
    if (outputPath === null || outputPath === '') return;
    await window.cg.export.run({ scene, outputPath });
  }

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
      <button
        style={styles.exportButton}
        disabled={exportBlocked}
        onClick={() => void exportVcg()}
        title={errorCount > 0 ? 'Resolve validation errors first' : 'Export to .vcg'}
      >
        EXPORT
      </button>
      <button style={styles.saveButton} disabled={scene === null} onClick={() => void save()}>
        SAVE
      </button>
      <span>{time}</span>
    </footer>
  );
}

function currentTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
