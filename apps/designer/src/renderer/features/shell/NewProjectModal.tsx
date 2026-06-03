import { useEffect, useState } from 'react';
import type { FrameRate, Resolution, TemplateType } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';

interface Props {
  onClose: () => void;
}

interface ResolutionPreset {
  label: string;
  width: number;
  height: number;
}

const PRESETS: readonly ResolutionPreset[] = [
  { label: '1920 × 1080  (16:9 HD)', width: 1920, height: 1080 },
  { label: '1280 × 720  (16:9 small)', width: 1280, height: 720 },
  { label: '1080 × 1920  (9:16 vertical)', width: 1080, height: 1920 },
  { label: 'Custom', width: 0, height: 0 },
];

const FRAME_RATES: readonly FrameRate[] = [25, 29.97, 50, 59.94, 60];

// Template choice was removed from the modal — `projects.create` still
// needs a TemplateType, so every new project ships as 'custom' and the
// operator picks a starter from the Library panel afterwards if needed.
const DEFAULT_TEMPLATE_TYPE: TemplateType = 'custom';

const styles = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0, 0, 0, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  modal: {
    width: 'min(440px, 92vw)',
    background: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.4rem',
    padding: '1.1rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.6rem',
    color: colors.text,
    fontSize: '0.84rem',
  },
  title: {
    fontSize: '1rem',
    fontWeight: 700,
    margin: 0,
    marginBottom: '0.2rem',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr',
    alignItems: 'center',
    gap: '0.5rem',
  },
  label: { color: colors.textMuted, fontSize: '0.78rem' },
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
  inlinePair: {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    gap: '0.3rem',
    alignItems: 'center',
  },
  buttonRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.4rem',
    marginTop: '0.5rem',
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
  primary: {
    background: colors.accent,
    color: '#000',
    border: `1px solid ${colors.accentMuted}`,
    fontWeight: 700,
  },
} as const;

/**
 * Modal dialog for the "New project" landing action (D-007). Collects
 * a name, resolution preset (or custom W×H), frame rate, and template
 * type, then calls `projects.create` with the overrides and switches
 * to the Studio view.
 */
export function NewProjectModal({ onClose }: Props): JSX.Element {
  const [name, setName] = useState('Untitled');
  const [presetIdx, setPresetIdx] = useState(0);
  const [customW, setCustomW] = useState(1920);
  const [customH, setCustomH] = useState(1080);
  const [frameRate, setFrameRate] = useState<FrameRate>(50);
  const [durationFrames, setDurationFrames] = useState(50);
  const isCustom = PRESETS[presetIdx]?.label === 'Custom';

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function confirm(): Promise<void> {
    const preset = PRESETS[presetIdx];
    if (preset === undefined) return;
    const resolution: Resolution = isCustom
      ? { width: Math.max(1, Math.round(customW)), height: Math.max(1, Math.round(customH)) }
      : { width: preset.width, height: preset.height };
    const result = await window.cg.projects.create({
      name: name.trim().length > 0 ? name.trim() : 'Untitled',
      templateType: DEFAULT_TEMPLATE_TYPE,
      resolution,
      frameRate,
      durationFrames: Math.max(1, Math.round(durationFrames)),
    });
    designerStore.setScene(result.scene, result.path);
    onClose();
  }

  return (
    <div style={styles.backdrop} role="dialog" aria-modal="true" aria-label="New project">
      <div style={styles.modal}>
        <h2 style={styles.title}>New project</h2>

        <div style={styles.row}>
          <span style={styles.label}>Name</span>
          <input
            style={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            aria-label="Project name"
          />
        </div>

        <div style={styles.row}>
          <span style={styles.label}>Resolution</span>
          <select
            style={styles.input}
            value={presetIdx}
            onChange={(e) => setPresetIdx(Number(e.target.value))}
            aria-label="Resolution preset"
          >
            {PRESETS.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {isCustom && (
          <div style={styles.row}>
            <span style={styles.label}>Custom W × H</span>
            <div style={styles.inlinePair}>
              <input
                style={styles.input}
                type="number"
                min={1}
                value={customW}
                onChange={(e) => setCustomW(Number(e.target.value))}
                aria-label="Width"
              />
              <span style={{ color: colors.textMuted }}>×</span>
              <input
                style={styles.input}
                type="number"
                min={1}
                value={customH}
                onChange={(e) => setCustomH(Number(e.target.value))}
                aria-label="Height"
              />
            </div>
          </div>
        )}

        <div style={styles.row}>
          <span style={styles.label}>Frame rate</span>
          <select
            style={styles.input}
            value={String(frameRate)}
            onChange={(e) => setFrameRate(Number(e.target.value) as FrameRate)}
            aria-label="Frame rate"
          >
            {FRAME_RATES.map((f) => (
              <option key={f} value={String(f)}>
                {f} fps
              </option>
            ))}
          </select>
        </div>

        <div style={styles.row}>
          <span style={styles.label}>Total frames</span>
          <div style={styles.inlinePair}>
            <input
              style={styles.input}
              type="number"
              min={1}
              value={durationFrames}
              onChange={(e) => setDurationFrames(Number(e.target.value))}
              aria-label="Total frames"
            />
            <span />
            <span style={{ color: colors.textMuted, fontSize: '0.74rem' }}>
              ≈ {(Math.max(1, Math.round(durationFrames)) / frameRate).toFixed(1)} s
            </span>
          </div>
        </div>

        <div style={styles.buttonRow}>
          <button type="button" style={styles.button} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            style={{ ...styles.button, ...styles.primary }}
            onClick={() => void confirm()}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
