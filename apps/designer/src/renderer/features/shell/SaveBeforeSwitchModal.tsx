import { useEffect, useState } from 'react';
import type { Scene } from '@cg/shared-schema';
import { colors } from '../../theme.js';

interface Props {
  /** The current scene the operator might lose if they switch. */
  scene: Scene;
  /** Existing save path; if null, the operator must pick one. */
  projectPath: string | null;
  /**
   * Called after the modal is fully resolved (save succeeded /
   * operator chose Discard). Caller proceeds with the project switch
   * inside this callback. NOT called on Cancel.
   */
  onProceed: () => void | Promise<void>;
  /** Close without proceeding. */
  onCancel: () => void;
}

const styles = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0, 0, 0, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 60,
  },
  modal: {
    width: 'min(420px, 92vw)',
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.4rem',
    padding: '1.1rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.7rem',
    color: colors.text,
    fontSize: '0.84rem',
  },
  title: {
    fontSize: '1rem',
    fontWeight: 700,
    margin: 0,
  },
  body: {
    color: colors.textMuted,
    fontSize: '0.8rem',
    lineHeight: 1.5,
    margin: 0,
  },
  pathRow: {
    display: 'grid',
    gridTemplateColumns: '70px 1fr',
    alignItems: 'center',
    gap: '0.5rem',
  },
  label: { color: colors.textMuted, fontSize: '0.74rem' },
  input: {
    background: colors.panelMuted,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.2rem',
    padding: '0.25rem 0.4rem',
    fontSize: '0.82rem',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  buttonRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.4rem',
    marginTop: '0.4rem',
  },
  button: {
    background: 'transparent',
    color: colors.text,
    border: `1px solid ${colors.border}`,
    padding: '0.3rem 0.7rem',
    borderRadius: '0.2rem',
    fontSize: '0.82rem',
    cursor: 'pointer',
  },
  buttonPrimary: {
    background: colors.accent,
    color: '#000',
    border: `1px solid ${colors.accentMuted}`,
    fontWeight: 700,
  },
  buttonDanger: {
    color: '#fda4af',
    border: `1px solid ${colors.border}`,
  },
  error: {
    color: '#fda4af',
    fontSize: '0.76rem',
    margin: 0,
  },
} as const;

/**
 * Asks the operator what to do with the currently-loaded project
 * before switching to a different one. Three outcomes:
 *
 *   - Save     → calls projects.save and then onProceed()
 *   - Discard  → calls onProceed() without saving
 *   - Cancel   → closes without proceeding
 */
export function SaveBeforeSwitchModal({
  scene,
  projectPath,
  onProceed,
  onCancel,
}: Props): JSX.Element {
  const [path, setPath] = useState<string>(
    projectPath ?? `projects/${slugify(scene.name)}.cg.json`,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  async function save(): Promise<void> {
    const trimmed = path.trim();
    if (trimmed.length === 0) {
      setError('Pick a save path.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await window.cg.projects.save({ scene, path: trimmed });
      await onProceed();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function discard(): Promise<void> {
    setBusy(true);
    try {
      await onProceed();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div style={styles.backdrop} role="dialog" aria-modal="true" aria-label="Save before switch">
      <div style={styles.modal}>
        <h2 style={styles.title}>Save current project?</h2>
        <p style={styles.body}>
          You have <strong>{scene.name}</strong> open
          {projectPath === null
            ? ' (not saved yet). Save it before opening another project, or discard the work.'
            : '. Save changes before opening another project, or discard them.'}
        </p>
        <div style={styles.pathRow}>
          <span style={styles.label}>Save as</span>
          <input
            style={styles.input}
            value={path}
            onChange={(e) => setPath(e.target.value)}
            aria-label="Save path"
            disabled={busy}
          />
        </div>
        {error !== null && <p style={styles.error}>{error}</p>}
        <div style={styles.buttonRow}>
          <button type="button" style={styles.button} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            style={{ ...styles.button, ...styles.buttonDanger }}
            onClick={() => void discard()}
            disabled={busy}
          >
            Discard
          </button>
          <button
            type="button"
            style={{ ...styles.button, ...styles.buttonPrimary }}
            onClick={() => void save()}
            disabled={busy}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled';
}
